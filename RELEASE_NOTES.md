## 0.3.0

Uncached now tells you when Git would publish a secret. Env files, private
keys, credential files and registry tokens that are committed, or sitting
outside .gitignore, are flagged on the project and listed on its page with the
command that stops Git from publishing them. Templates such as .env.example,
public certificates and tokens read from a variable are left alone.

The Git panel shows how much the repository's own data weighs, and suggests
git gc when Git itself would repack it.

Dependencies now lists the Node, Rust, Python and Java versions installed by
nvm, fnm, rustup, pyenv or SDKMAN that no project pins, with the command that
removes each one. Free shows how many and how much space; Pro lists them.

For Pro:

- Maintenance can also run when the disk holding your folders drops below
  10, 25 or 50 GB free.
- A project can be kept out of maintenance from its page or from the
  Maintenance screen.
- The menu bar shows free space and what can be reclaimed, and can start
  maintenance.
- An optional weekly summary of what was freed and what is left.

Fixed: saving a setting could make scheduled maintenance run before its
interval.

## 0.2.4

Uncached now ships with the Night icon: the yellow mark on a dark plate.
Hazard stays as one of the Pro icons.

Fixed: the Reclaim review kept redrawing itself for as long as it was open,
using CPU for nothing.

The cleanup confetti now uses the Garbage Man colours, and the Pro licence
card drops its decorative icons.

## 0.2.3

A new icon to match the new look: the Uncached mark on hazard yellow.

On Pro, Settings > Appearance > App icon puts one of six variants in the Dock
while Uncached is open: Hazard, Night, Sunset, Olive, Ultraviolet, and
Evergreen, the old green. Finder and Launchpad keep the standard icon.
