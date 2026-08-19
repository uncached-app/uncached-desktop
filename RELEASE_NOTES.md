## 0.1.1-alpha.8

Uncached now finds the scratch directories AI coding tools leave outside your
home folder. A Claude Code session keeps its working files under `/tmp`, in a
directory named after your user id, and no catalogue entry could reach it —
this machine had 7.6 GB sitting there. Codex, Cursor, Copilot, Aider, opencode
and Continue are read the same way, alongside the model and inference caches
that Hugging Face, Ollama, llama.cpp, PyTorch, Whisper and Torch Inductor keep
in the home directory.

Nothing is offered while the tool that owns it is running. A cache being
written to is not disposable at that moment: removing it takes files the
process still has open, which breaks what was running instead of freeing space.
The row shows what it weighs and why it cannot be taken, and has no checkbox —
and the check is taken again at removal, because a scan and a cleanup are
minutes apart and opening the tool in between is the ordinary case rather than
the exotic one.

The same is now true of your own projects. A project with a dev server or a
watcher inside it read as busy on the workspace screen and as reclaimable in
Reclaim, because only one of the two screens was asking. Both read the same
answer now, so its artifacts carry the reason there as well.

A cleanup that is refused says so. Removing forty targets where two are
declined used to end exactly like one where none were — the dialog closed, the
selection emptied, and the two rows simply stayed on screen. The refused ones
now stay selected under a notice that says how many there were and what the
system answered, so pressing again once the reason is gone retries them.

What is offered is deliberately narrow. Only directories whose owner can be
named, never a tool's own folder — `~/.claude` mixes disposable scratch with
history and settings, so only proven subpaths under it appear. Session scratch
is read on macOS and Linux, where the convention is the same; Windows keeps its
temporary files somewhere this has not confirmed, and a guess there would be a
guess about a directory the product offers to delete.
