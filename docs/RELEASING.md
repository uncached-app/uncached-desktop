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

They fail differently and are configured separately. **The updater works today;
the certificates are still outstanding**, so a first install shows "unidentified
developer" on macOS and "Unknown publisher" on Windows. That is a purchase
experience problem, not an update problem.

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
| `UNCACHED_LICENSE_PUBLIC_KEY` | secret | The build verifies no licence at all — every activation fails, silently, for somebody who has just paid. The workflow refuses to build without it |
| `UNCACHED_CORE_DEPLOY_KEY` | secret | The private core cannot be checked out |
| `CLOUDFLARE_API_TOKEN` | secret | Nothing reaches R2. Needs **Object Read & Write** on that bucket and nothing else |
| `CLOUDFLARE_ACCOUNT_ID` | secret | Same |
| `R2_BUCKET` | variable | Same |

Apple and Windows signing add `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`,
`APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`. The
workflow passes them through already; they are simply absent.

## Publishing

```bash
# 1. Bump both, and keep them equal — the manifest is built from tauri.conf.json
#    and the app reports package.json. A mismatch means the badge offers a
#    version the About screen says is already installed.
#      package.json            "version"
#      src-tauri/tauri.conf.json  "version"

git commit -am "release: 0.1.2"
git tag v0.1.2
git push origin master --tags
```

The tag is the trigger. `workflow_dispatch` builds and signs without publishing,
which is how a release is rehearsed.

## What the workflow does, and the order it matters in

1. Builds four targets: macOS arm64, macOS x64, Linux x64, Windows x64.
2. Signs each updater bundle with the minisign key.
3. Uploads every bundle to `releases/<version>/<triple>/`, cached for a year and
   immutable.
4. **Then** uploads `latest.json`, cached for five minutes.

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
