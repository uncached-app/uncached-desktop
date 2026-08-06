use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CleanMode {
    Trash,
    Permanent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanRequest {
    pub target_id: String,
    pub mode: CleanMode,
    pub confirmation: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanResult {
    pub success: bool,
    pub target_path: String,
    pub freed_bytes: u64,
    pub mode_used: CleanMode,
    pub message: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::{CleanMode, CleanRequest};

    #[test]
    fn serializes_clean_request_with_camel_case_fields() {
        let request = CleanRequest {
            target_id: "target-1".to_string(),
            mode: CleanMode::Trash,
            confirmation: None,
        };

        let value = serde_json::to_value(request).unwrap();
        assert_eq!(value["targetId"], "target-1");
        assert!(value.get("target_id").is_none());
    }
}
