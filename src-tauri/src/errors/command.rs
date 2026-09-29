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

/// Anything without a code of its own: shown as the backend wrote it.
impl From<String> for CommandError {
    fn from(message: String) -> Self {
        Self::new("internal", message)
    }
}
