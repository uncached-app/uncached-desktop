/** Mirrors `src-tauri/src/commands/toolchains.rs`. */
export type ToolchainRuntime = "node" | "rust" | "python" | "java";
export type ToolchainManager = "nvm" | "fnm" | "rustup" | "pyenv" | "sdkman";

export type UnusedToolchain = {
  runtime: ToolchainRuntime;
  manager: ToolchainManager;
  version: string;
  path: string;
  bytes: number;
  /** The manager's own command; Uncached never removes a toolchain. */
  uninstall: string;
};

export type ToolchainReport = {
  installedCount: number;
  unusedCount: number;
  unusedBytes: number;
  /** Heaviest first; empty without Pro. */
  unused: UnusedToolchain[];
  locked: boolean;
};
