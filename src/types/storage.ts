/** Mirrors `StorageReport` in `src-tauri/src/commands/storage.rs`. */
export type StorageReport = {
  path: string;
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  /** macOS only: space counted as used that the system would release. */
  purgeableBytes: number | null;
  /** macOS only: whether this process may read the whole volume. */
  fullDiskAccess: boolean | null;
};
