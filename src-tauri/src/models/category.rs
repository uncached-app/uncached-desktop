use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Category {
    NodeModules,
    CargoTarget,
    NextJs,
    DotNetObj,
    PyCache,
    Gradle,
    Docker,
    Custom(String),
}

impl fmt::Display for Category {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Category::NodeModules => write!(f, "node_modules"),
            Category::CargoTarget => write!(f, "Cargo target"),
            Category::NextJs => write!(f, ".next"),
            Category::DotNetObj => write!(f, "bin/obj"),
            Category::PyCache => write!(f, "__pycache__"),
            Category::Gradle => write!(f, ".gradle"),
            Category::Docker => write!(f, "Docker cache"),
            Category::Custom(name) => write!(f, "{}", name),
        }
    }
}
