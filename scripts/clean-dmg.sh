#!/bin/sh

set -eu

# Opening a DMG creates a mounted volume. Eject only this app's volumes so
# unrelated disk images remain untouched.
hdiutil info |
  sed -n 's/^[[:space:]]*\(\/Volumes\/Uncached[^[:space:]]*\).*$/\1/p' |
  while IFS= read -r volume; do
    [ -n "$volume" ] || continue
    hdiutil detach "$volume" >/dev/null 2>&1 || hdiutil detach -force "$volume" >/dev/null
  done

# Tauri may leave an intermediate read/write image after an interrupted build.
for image in target/release/bundle/dmg/rw.*.dmg; do
  [ -e "$image" ] || continue
  rm -f "$image"
done
