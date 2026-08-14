use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CleanMode {
    Trash,
    Permanent,
}

/// Who asked for a cleanup.
///
/// Recorded rather than inferred: once a schedule can run one of these, "I did
/// not do that" is a question the history has to be able to answer, and a run
/// nobody watched is exactly the one worth being able to look up.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum CleanupTrigger {
    #[default]
    Manual,
    Scheduled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanRequest {
    pub target_id: String,
    pub mode: CleanMode,
    pub confirmation: Option<String>,
    /// Defaulted so the interface never sends it: a request without one came
    /// from a person clicking, which is the only caller that exists today.
    #[serde(default)]
    pub trigger: CleanupTrigger,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanResult {
    pub success: bool,
    pub target_path: String,
    pub freed_bytes: u64,
    pub size_has_errors: bool,
    pub mode_used: CleanMode,
    pub message: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::{CleanMode, CleanRequest, CleanResult};

    #[test]
    fn serializes_clean_request_with_camel_case_fields() {
        let request = CleanRequest {
            target_id: "target-1".to_string(),
            mode: CleanMode::Trash,
            confirmation: None,
            trigger: super::CleanupTrigger::default(),
        };

        let value = serde_json::to_value(request).unwrap();
        assert_eq!(value["targetId"], "target-1");
        assert!(value.get("target_id").is_none());
    }

    /// The interface predates the field and still sends requests without it.
    #[test]
    fn a_request_without_a_trigger_is_a_manual_one() {
        let request: CleanRequest =
            serde_json::from_value(serde_json::json!({ "targetId": "t", "mode": "Trash" }))
                .unwrap();

        assert_eq!(request.trigger, super::CleanupTrigger::Manual);
    }

    #[test]
    fn serializes_partial_size_flag_with_camel_case() {
        let result = CleanResult {
            success: true,
            target_path: "C:\\workspace\\target".to_string(),
            freed_bytes: 7,
            size_has_errors: true,
            mode_used: CleanMode::Trash,
            message: None,
        };

        let value = serde_json::to_value(result).unwrap();
        assert_eq!(value["sizeHasErrors"], true);
        assert!(value.get("size_has_errors").is_none());
    }
}
