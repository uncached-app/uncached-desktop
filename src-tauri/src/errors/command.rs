use serde::Serialize;
use std::collections::BTreeMap;

/// A refusal the interface translates rather than displays.
///
/// `code` selects the sentence and `params` fill it; `message` is the English
/// text, kept for logs and for an interface that does not know the code.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    pub code: &'static str,
    pub message: String,
    pub params: BTreeMap<&'static str, String>,
}

impl CommandError {
    pub fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            params: BTreeMap::new(),
        }
    }

    pub fn with(mut self, name: &'static str, value: impl Into<String>) -> Self {
        self.params.insert(name, value.into());
        self
    }
}

/// Anything without a code of its own. The English text travels as `detail`
/// so the interface can frame it in the reader's language.
impl From<String> for CommandError {
    fn from(message: String) -> Self {
        Self::new("internal", message.clone()).with("detail", message)
    }
}

impl From<crate::errors::error::NukeError> for CommandError {
    fn from(error: crate::errors::error::NukeError) -> Self {
        use crate::errors::error::NukeError;
        let message = error.to_string();
        match error {
            NukeError::Core(info) => {
                let code = serde_json::to_value(info.code)
                    .ok()
                    .and_then(|value| value.as_str().map(str::to_owned));
                match code.as_deref() {
                    Some("target_in_use") => Self::new("target_in_use", info.message)
                        .with("program", info.operation.unwrap_or_default()),
                    _ => Self::from(info.message),
                }
            }
            NukeError::Io(source) => Self::new("io", message).with("detail", source.to_string()),
            NukeError::NotFound(detail) => Self::new("not_found", message).with("detail", detail),
            NukeError::PermissionDenied(detail) => {
                Self::new("permission_denied", message).with("detail", detail)
            }
            NukeError::NoScanRoot => Self::new("no_folder_selected", message),
            NukeError::NotADirectory(_) => Self::new("not_a_folder", message),
            NukeError::ScanCancelled => Self::new("scan_cancelled", message),
            NukeError::CleanupCancelled => Self::new("cleanup_cancelled", message),
            NukeError::InUse(program) => {
                Self::new("target_in_use", message).with("program", program)
            }
            NukeError::Internal(detail) => Self::new("internal", message).with("detail", detail),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::CommandError;
    use crate::errors::error::NukeError;

    #[test]
    fn text_without_a_code_travels_as_detail() {
        let error = CommandError::from("disk on fire".to_string());
        assert_eq!(error.code, "internal");
        assert_eq!(
            error.params.get("detail").map(String::as_str),
            Some("disk on fire")
        );
    }

    #[test]
    fn scan_refusals_carry_codes_the_interface_translates() {
        let cases = [
            (NukeError::NoScanRoot, "no_folder_selected"),
            (NukeError::NotADirectory("/w/file".into()), "not_a_folder"),
            (NukeError::ScanCancelled, "scan_cancelled"),
            (NukeError::NotFound("/w/gone".into()), "not_found"),
        ];
        for (error, code) in cases {
            assert_eq!(CommandError::from(error).code, code);
        }
    }

    #[test]
    fn a_target_in_use_names_the_program_either_way() {
        let local = CommandError::from(NukeError::InUse("Xcode".into()));
        assert_eq!(
            (local.code, local.params.get("program").cloned()),
            ("target_in_use", Some("Xcode".into()))
        );

        let info = uncached_core::CoreError::TargetInUse {
            program: "Docker".into(),
        }
        .public_info();
        let core = CommandError::from(NukeError::Core(info));
        assert_eq!(
            (core.code, core.params.get("program").cloned()),
            ("target_in_use", Some("Docker".into()))
        );
    }
}
