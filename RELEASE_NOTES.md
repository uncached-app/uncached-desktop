## 0.1.1-alpha.4

Windows was where most of this went wrong.

Scanning no longer strobes console windows across the screen. Reading a
workspace starts four Git processes per project, and each one was opening a
console of its own — the work was correct and the app looked like it was
breaking.

Paths are shown the way you write them, without the `\\?\` prefix the system's
own canonical form carries.

Settings opens from the bar at the bottom, on every screen. It used to be in a
footer only the Workspace screen drew, so on Windows the way in disappeared on
Maintenance and Insights.

And the login item is named Uncached, not uncached.

On macOS, the app no longer reports itself as damaged. It is still not signed by
a certificate Apple knows — right-click and Open the first time — but that is a
dialog with a way through rather than one telling you to throw it away.

Everywhere, the window now opens in whatever appearance your machine already
uses, instead of starting light and announcing it with a white flash.
