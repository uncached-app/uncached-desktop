# Filesystem Cleanup Security

Core revalidates workspace containment, non-symlink ancestry, target identity
where the platform exposes stable metadata, target name, and package context
immediately before calling `trash::delete`.

The final Trash call still accepts a path because the cross-platform Trash API
does not provide an atomic open-handle deletion primitive. An operating system
or another process can replace that path after validation and before
`trash::delete` opens it. This unavoidable path-based TOCTOU race remains a
residual risk; validation must not be weakened to hide it.
