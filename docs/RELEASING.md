# Releasing

An update reaches an installed copy of Uncached through one static file:
`https://cdn.uncached.app/latest.json`, served from the R2 bucket. The app reads
it, compares versions, verifies a signature, and asks. Nothing else is involved
— no Worker, no API, no account.

## The two signings, which are not the same thing

| | What it proves | Who checks it | If it is missing |
| --- | --- | --- | --- |
| **Updater key** (minisign) | This update came from us | Uncached itself | Every update is refused |
| **Apple / Windows certificate** | The app is not malware | The operating system | It installs, behind a warning |

They fail differently and are configured separately. **Both are configured for
macOS:** the release signs the app and the dmg with the Developer ID, notarises
both and staples the tickets. **Windows is not released.** It is to ship through
the Microsoft Store, which signs and updates it, so it has no build in the
release and no entry in `latest.json`.

Without the Apple secrets, macOS bundles fall back to **ad-hoc** signing —
`APPLE_SIGNING_IDENTITY=-`.
That is not cosmetic. An unsigned bundle on Apple Silicon is not merely
untrusted: Gatekeeper calls it *damaged* and offers no way through, and the only
escape is `xattr -cr /Applications/Uncached.app` in a terminal — which is not
something to ask of somebody who just downloaded an app. Ad-hoc makes it say
"unidentified developer" instead, which is true, and which the dialog itself
offers a way past (right-click → Open).

An ad-hoc signature cannot be notarised, so this is the floor rather than a
substitute.

### The updater key cannot be rotated

Its public half is compiled into every binary that ships. A copy of Uncached in
somebody's Applications folder will only ever accept updates signed by the key
that was compiled into it — so **losing the private key ends the update path for
every copy already installed**. Those users would have to download a new build
by hand, and would have no way of being told to.

It was generated to `~/.tauri/uncached-updater.key`, outside every repository.
Back it up somewhere that survives this machine.

## Secrets

Repository → Settings → Secrets and variables → Actions.

```bash
gh secret set TAURI_SIGNING_PRIVATE_KEY < ~/.tauri/uncached-updater.key
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --body ""   # generated without one
gh variable set R2_BUCKET --body "<the bucket behind cdn.uncached.app>"
```

| Name | Kind | Why the release fails without it |
| --- | --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | secret | Bundles ship unsigned; every client refuses them |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | secret | Empty string, because the key was generated without one |
| `UNCACHED_LICENSE_PUBLIC_KEY` | secret, **optional** | Not needed. The key is committed in `src-tauri/.cargo/config.toml`, where a public key belongs — it verifies signatures and unlocks nothing, and keeping it there is what makes a laptop build and a release build accept the same licences. Set this secret only to override that. The workflow refuses to build when **neither** exists, because such a build unlocks nothing for anybody and says so nowhere |
| `UNCACHED_CORE_DEPLOY_KEY` | secret | The private core cannot be checked out |
| `R2_ACCESS_KEY_ID` | secret | Nothing reaches R2. Shown once, beside the R2 token |
| `R2_SECRET_ACCESS_KEY` | secret | Same |
| `CLOUDFLARE_ACCOUNT_ID` | secret | Forms the S3 endpoint, `https://<id>.r2.cloudflarestorage.com` |
| `R2_BUCKET` | variable | Same |

### R2 is written over S3, not through wrangler

The R2 token that owns this bucket is scoped to **objects in it** — the least
privilege the job needs — and that is exactly the scope the S3 API was built
for. Its three values are shown together at creation and only then:

| value | what it is for |
| --- | --- |
| Token value | wrangler and Cloudflare's REST API. **Not used here** |
| Access Key ID | `R2_ACCESS_KEY_ID` |
| Secret Access Key | `R2_SECRET_ACCESS_KEY` |

`wrangler r2 object put` was tried first and always returned `403` with
`code: 10000`, while reporting itself as authenticated — which it was, for a
route the token was not entitled to. That REST route wants account-level R2
permission, so making it work meant either widening the token to one that can
create and delete buckets, or speaking the protocol the narrow token already
has. `aws` ships on the runner, so the narrow token stays.

Apple signing adds `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`,
`APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`. All six
are set; the workflow forwards them to the macOS builds, which sign with the
Developer ID and notarise. If they were removed, the builds would fall back to
ad-hoc signing as described above.

## Nothing runs on a push

Every workflow is manual or tagged. The release runs on a tag; both CI jobs run
only when asked. So **the checks before a tag are yours to run**, and this is
the list:

```bash
# in uncached-desktop
pnpm test && npx tsc --noEmit
cd src-tauri && cargo test && cargo clippy --all-targets -- -D warnings && cargo fmt --check
cd .. && bash scripts/check-platforms.sh

# and, if uncached-core changed
cd ../uncached-core && cargo test && cargo fmt --check
cargo clippy --target x86_64-unknown-linux-gnu --all-targets -- -D warnings
cargo clippy --target x86_64-pc-windows-msvc --all-targets -- -D warnings
```

**What that list cannot do is compile the Tauri crate for Linux or Windows.**
Its C dependencies do not cross-build from a Mac, and `check-platforms.sh` says
so in its own header: it turns off our macOS-only blocks, which catches an error
inside them, and cannot make a dependency's macOS-only method disappear. Two
releases died on exactly that, at about eighty-seven cents each.

The eight-cent answer, when a tag is close:

```bash
gh workflow run ci.yml                                  # desktop, Linux
gh workflow run ci.yml --repo uncached-app/uncached-core
```

Nothing compiles the desktop crate for Windows any more: neither workflow has a
Windows job. Expect fixes the first time the Store package is built.

The rest of the checks live where you are:

```bash
pnpm test
npx tsc --noEmit
cd src-tauri && cargo test && cargo clippy --all-targets -- -D warnings && cargo fmt --check
```

**Those only cover the platform you are on.** Two bugs shipped this way already
— a lifetime error in `tray.rs` and a pair of key tests asserting the macOS
rule — both invisible from a Mac and both found by a build that cost four
platforms to run. `cargo clippy --target x86_64-unknown-linux-gnu` and
`--target x86_64-pc-windows-msvc` check the other two without leaving your
machine, and are worth running before a tag. They work because checking does
not link.

For the Tauri crate, whose Linux build needs system libraries a Mac does not
have, the same thing is done by inverting a `cfg` locally and compiling. Less
tidy, and still cheaper than finding out on a release runner.

## Publishing

Three files carry the version and all three must agree:

- `package.json`
- `src-tauri/tauri.conf.json` — the manifest is built from this one
- `src-tauri/Cargo.toml`

Drift here is not visible from outside: the badge would offer a version the
About screen says is already installed, which reads as the updater being
broken. The release workflow checks them before it builds anything.

And `RELEASE_NOTES.md` is what the update panel shows. Its first line is the
version it describes, which is how the workflow refuses to publish notes left
at the previous release — notes for the wrong version are worse than none,
because nothing downstream can tell. That heading is dropped from what ships:
the app draws the version directly above these words.

```bash
git commit -am "release: 0.3.0"
git tag v0.3.0
git push origin master --tags
```

The tag is the trigger. `workflow_dispatch` takes two inputs:

- `dry_run` (default `true`): builds, signs and uploads the bundles to the CDN
  and validates the manifest, but does not replace `latest.json` or attach
  anything to a GitHub release. This is how a release is rehearsed.
- `publish_only` (default `false`): skips the build and publishes the bundles
  already on the CDN for this version. Used when a release failed after the
  build. With `dry_run` left on it only rebuilds and validates the manifest.

## Windows

Windows is not released; the plan is an MSIX through the Microsoft Store, so the
NSIS settings and installer artwork in `tauri.conf.json` and
`scripts/build-installer-art.mjs` are unused.

## What the workflow does, and the order it matters in

1. Builds three targets: macOS arm64, macOS x64, Linux x64. The macOS builds are
   signed with the Developer ID and notarised.
2. Signs each updater bundle with the minisign key.
3. Uploads every bundle to `releases/<version>/<triple>/`, cached for a year and
   immutable.
4. **Then** uploads `latest.json`, cached for five minutes.
5. Attaches the installers — dmg, deb, rpm and AppImage — to a draft GitHub
   release for the tag. The updater bundles are not attached; they live only on
   the CDN.

Step 4 is last and separate on purpose. `latest.json` is what tells running apps
that a version exists; if it landed before the bundle it names, every client
checking in that window would download a truncated file and fail its signature —
which reads as the update system being broken rather than a few seconds early.

The five-minute cache is the other half. Everything under `releases/` never
changes and is cached for a year; `latest.json` exists to change, and an
immutable cache on it would mean a release nobody hears about until the edge
forgets.

### The architecture path is not decoration

Both macOS builds emit a bundle with the same filename. Flattened into one
directory, one silently overwrites the other and half of all Mac users are
handed the wrong architecture — after downloading it. Hence
`releases/<version>/<triple>/<file>`, and a check in
`scripts/build-update-manifest.mjs` that refuses to publish a manifest where two
platforms resolve to the same URL.

### A missing platform is a failed release

The manifest builder exits non-zero rather than writing a smaller manifest. A
platform absent from `latest.json` is not an error anybody sees: those users are
simply never offered an update again, and a client that is not offered one looks
exactly like a client that is current.

## Checking it worked

```bash
curl -s https://cdn.uncached.app/latest.json | jq
curl -sI "$(curl -s https://cdn.uncached.app/latest.json | jq -r '.platforms["darwin-aarch64"].url')"
```

The second one matters more than it looks: it is the check that the manifest
names a file that is actually there.

In the app, Settings → About has **Check for updates**, which reports what the
badge deliberately does not — including why a check failed.
