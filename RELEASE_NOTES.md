## 0.1.1-alpha.9

Uncached now finds the caches you moved off your boot disk.

Relocating a package store or Xcode's `DerivedData` onto a second volume is the
ordinary thing to do on a machine whose internal drive is the small one: you
move the directory and leave a link where it used to be, and every tool that
looks for it follows the link without noticing. Uncached did notice, and
stopped — a catalogued entry that turned out to be a link was skipped, without
saying so. The entries people move are the largest ones the catalogue names, so
the caches most worth finding were the ones guaranteed to be missed.

The link is followed now. What is reported is where the directory actually
lives, on whichever volume that is, and the cleanup that follows is checked
against that volume rather than against your home folder — so a target you were
offered is a target that can be removed. Finding something and then refusing to
touch it would have been the worse half of this fix.

On Windows the same move is usually a junction rather than a symbolic link,
because making one needs no administrator. Junctions are read too, along with
every other kind of reparse point, rather than only the one the platform calls
a symbolic link.

A link that leads nowhere, or to a file rather than a directory, is still
ignored. It is not the cache the catalogue named, and guessing that it might be
is not a guess this product makes about a directory it offers to delete.
