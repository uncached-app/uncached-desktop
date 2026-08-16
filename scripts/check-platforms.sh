#!/bin/bash
# Compiles the code the other platforms get, from this one.
#
# Twice in one day a release died on `#[cfg(target_os = "macos")]` code whose
# other half had never been compiled by anything: a lifetime error in `tray.rs`,
# and a builder method that only exists on macOS. Each cost a four-platform run
# to discover something a compile would have said in seconds.
#
# **This does not replace building for those platforms, and proving that took
# reintroducing a bug it then failed to catch.** Rewriting our own `cfg` blocks
# turns off our own code; it cannot make a dependency's macOS-only method
# disappear, because the dependency is still compiled for this host. So calling
# an API that exists only on macOS — which is what broke 0.1.1-alpha.4 — passes
# here and fails on the runner.
#
# What it does catch is an error *inside* code that is compiled out on this
# machine: the lifetime error in `tray.rs` was exactly that. Worth running, and
# not worth trusting alone. The Linux job in CI is what actually settles it.
#
#   bash scripts/check-platforms.sh
#
# Two techniques, because the two crates differ:
#
#   uncached-core is pure Rust, so `--target` works directly. Checking does not
#   link, so no cross toolchain is needed.
#
#   The Tauri crate pulls in C dependencies that will not cross-build from a
#   Mac, so its macOS-only blocks are turned off by rewriting their `cfg` to a
#   target that is never true here, and what is left is compiled. That is the
#   shape Linux and Windows get.
set -euo pipefail

cd "$(dirname "$0")/.."
CORE="../uncached-core"
FAILED=0

say() { printf "\n\033[1m%s\033[0m\n" "$1"; }

if [ -d "$CORE" ]; then
  say "uncached-core, on every platform"
  for target in x86_64-unknown-linux-gnu x86_64-pc-windows-msvc; do
    printf "  %-28s" "$target"
    if (cd "$CORE" && cargo clippy --quiet --target "$target" --all-targets -- -D warnings 2>/dev/null); then
      echo "ok"
    else
      echo "FAILED"; FAILED=1
    fi
  done
fi

say "the desktop crate, as the other platforms see it"
# Every macOS-only block off at once. Their contents are what a Mac has already
# compiled; what has not been compiled is everything else with those blocks
# absent, which is exactly what this produces.
FILES=$(grep -rl 'cfg(target_os = "macos")' src-tauri/src || true)
if [ -z "$FILES" ]; then
  echo "  no macOS-only code to check"
else
  # shellcheck disable=SC2086
  BACKUP=$(mktemp -d)
  trap 'for f in $FILES; do cp "$BACKUP/$(echo "$f" | tr / _)" "$f"; done; rm -rf "$BACKUP"' EXIT
  for f in $FILES; do
    cp "$f" "$BACKUP/$(echo "$f" | tr / _)"
    # `freebsd` is a real target_os, so this does not trip the unexpected-cfg
    # lint the way an invented name would, and it is never true here.
    perl -pi -e 's/cfg\(target_os = "macos"\)/cfg(target_os = "freebsd")/g; s/cfg\(not\(target_os = "macos"\)\)/cfg(not(target_os = "freebsd"))/g' "$f"
  done
  printf "  %-28s" "not(macos)"
  if (cd src-tauri && cargo clippy --quiet --lib -- -D warnings 2>/dev/null); then
    echo "ok"
  else
    echo "FAILED"
    (cd src-tauri && cargo clippy --lib -- -D warnings 2>&1 | grep -E "^(error|warning)" -A 6 | head -30) || true
    FAILED=1
  fi
fi

if [ "$FAILED" -ne 0 ]; then
  say "Something here does not compile off macOS. It would have failed a release."
  exit 1
fi

say "Nothing here fails. That is not the same as every platform compiling —"
echo "a call to an API that only exists on macOS still passes this check."
