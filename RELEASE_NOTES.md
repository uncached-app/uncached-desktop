## 0.1.1-alpha.10

Uncached now shows more of what fills a developer's disk, including what it
will not remove itself.

The uv cache is found and offered on macOS, Linux and Windows, as a shared
cache: reviewed, never cleaned automatically, and rebuilt by uv on demand. The
Claude app's browser caches are found too, and held back while the app is open.

Simulator runtimes are usually the heaviest thing Xcode leaves behind, and they
live outside your home folder, where Uncached never looked. They are measured
now, and listed below the reclaim list under "Not removed by Uncached" together
with Xcode's archives and simulator devices. Each row carries the command its
own tool reclaims it with — `xcrun simctl runtime delete`, `xcrun simctl delete
unavailable` — ready to copy. Uncached does not run it, and still refuses to
delete those folders itself.

A folder that measures zero bytes is no longer listed. A pnpm workspace
package's `node_modules` holds only links to its siblings: removing it frees
nothing and breaks imports until the next install.
