## 0.1.1-alpha.7

Opening a workspace no longer walks it for artifacts. Reading the projects
takes milliseconds; finding every build directory inside them, and then the
tool caches in your home folder, is the long part — and none of it answers
"what have I got". That walk now runs when you open Reclaim, which is the
screen that needs it, and it says what it is doing while it does: first your
projects, then your caches, naming folders as it finds them.

A project with a dev server or a watcher running inside it is left alone and
says so. Its artifacts are being written to while they would be read, so a
weight would be wrong on arrival and a reclaim is one the system will refuse.
The row names the process instead, the project's page opens with a warning, and
selecting one of its targets tells you before you press the button rather than
after.

Bundled `vendor` directories are no longer offered. A WordPress plugin ships
other people's package trees, each with a `composer.json` that looks from the
outside exactly like a project root — but nothing there can put the directory
back. Composer artifacts now need a lock file or a repository, and anything
below a plugin or theme root is left where it is.

The window resizes from its own edge on macOS. It never did: the only border
the system offered was the outer rim of the shadow, sixteen pixels out in
transparent space.

Paste works. There was no Edit menu, and on macOS that is what delivers ⌘V —
so no text field in the app could be pasted into, including the one that takes
a licence key.

The licence screen was rebuilt around that. It offers the key itself before the
button that removes it, rather than the order reference under a label that said
"Licence Key"; an expired licence leads with itself instead of greeting a
paying customer as a free user; and a key pasted out of an email has the line
breaks taken out of it, which were reaching the verifier as part of the
signature.

Themes preview as you move through them, by pointer or by arrow key, and the
window crossfades rather than jumping. The arrow keys reached that list for the
first time here — clicking a button on macOS does not focus it, so every
dropdown in the app was one the keyboard could not drive.

Smaller things: locked targets show what they weigh, which the totals above them
were already counting; options that cannot be chosen stop lighting up under the
pointer and say why; the workspace header dropped a spinner that described work
happening elsewhere.
