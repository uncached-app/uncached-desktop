# Filesystem Cleanup Security

Core revalidates workspace containment, non-symlink ancestry, target identity
where the platform exposes stable metadata, target name, and package context
before cleanup. On Windows, Trash uses Shell `IFileOperation` with retained
verification handles, revalidation before and after releasing those handles,
and a progress-sink callback for the expected target.

Windows cleanup succeeds only when the operation is not aborted, the expected
target receives a successful callback, and postcondition checks pass. The
final Shell operation still cannot be made handle-atomic: after verification
handles are released, an operating system or another process can change the
Shell namespace before or during the operation. Ambiguous identity or
postcondition results fail closed. This residual race remains and validation
must not be weakened to hide it.

On non-Windows platforms, v1 reports `moveToTrash: false` and returns typed
`secure_trash_unavailable` without mutating the target. Permanent cleanup uses
the platform-specific secure backend separately; native HRESULTs and other
private native details never cross the public IPC contract.
