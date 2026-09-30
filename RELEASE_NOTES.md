## 0.2.0

Uncached leaves alpha. On macOS it is now signed and notarised by Apple, so
it opens without the "unidentified developer" warning.

Dependencies is a new module. It lists packages declared in package.json or
Cargo.toml that nothing in their project names: no import, no configuration
file, no script. Each one comes with how sure the reading is, why, and the
command your package manager removes it with, to copy and run yourself.
Uncached never removes them.

Workspace is one list again. The map is gone; what only it showed, packages
several projects keep their own copy of, is in Insights, where each one names
its projects and opens the list narrowed to them. The folder actions sit
behind one "Open folder in…" button, the at-risk count filters the list, and
long package lists show the heaviest first with "show more".

The reclaimed total is the same number on every screen, and the picker calls
it what it is: everything Uncached has reclaimed so far.

Reclaim says "Move to Trash" when that is what happens, and its filters are
labelled.

Every refusal is in your language now, including the ones about folders,
Git, the scan and settings.

Settings > About can copy a diagnostic report for a support request: version,
system, plan and the end of the log, with your home folder shown as ~.
Nothing is sent. On macOS the log is in ~/Library/Logs/Uncached.
