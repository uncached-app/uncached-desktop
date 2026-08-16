#!/bin/sh

set -eu

# Opening a DMG creates a mounted volume. Eject only this app's volumes so
# unrelated disk images remain untouched.
#
# `dmg.*` is matched as well as `Uncached*`. A bundle that dies partway leaves
# its scratch volume behind under a random name like `/Volumes/dmg.KapdIX`, and
# because that name does not carry the app's, the next build walked straight
# into it and failed with nothing but "failed to run bundle_dmg.sh".
hdiutil info |
  sed -n 's/^[[:space:]]*\(\/Volumes\/\(Uncached\|dmg\.\)[^[:space:]]*\).*$/\1/p' |
  while IFS= read -r volume; do
    [ -n "$volume" ] || continue
    hdiutil detach "$volume" >/dev/null 2>&1 || hdiutil detach -force "$volume" >/dev/null
  done

# Tauri may leave an intermediate read/write image after an interrupted build.
for image in target/release/bundle/dmg/rw.*.dmg; do
  [ -e "$image" ] || continue
  rm -f "$image"
done
