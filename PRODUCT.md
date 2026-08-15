# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Local developers maintaining project workspaces on their own machines. They already know what `node_modules`, a Cargo `target/`, and a `__pycache__` are, and they read interfaces the way they read tool output: counts, paths, sizes, consequences.

## Product Purpose

Uncached finds regenerable build artifacts produced by software projects and reclaims the disk they occupy, without manual hunting through folders. Success means a developer can review detected targets with real byte sizes and move the selected ones to the system Recycle Bin/Trash.

## Positioning

Safety-first cleanup for developer workspaces: Uncached detects known disposable artifacts, requires contextual confirmation, and permits cleanup only for targets registered during the current scan session. The frontend never authorizes arbitrary paths.

The interface is visually calm; the language is not. Copy is spec-terse and written for developers — real artifact names, exact counts, stated consequences, no reassurance. `DESIGN.md` § Voice & Copy is the authority for every string, including error and empty states.

## Operating Context

Users choose or paste a workspace folder, run an asynchronous scan, review detected targets and their estimated sizes, select targets, confirm cleanup, and move them to the native Recycle Bin/Trash. Scan progress and cleanup events update the interface while long operations run.

Step 2 covers two overlapping backend phases, and the interface names both. While the tree walk runs, targets stream in and are sized concurrently. When the walk finishes, sizing usually has not — the step stays open, reporting measurement, until every target has settled. Review opens only once the reported target count is reached and no size is pending. Cancellation is only meaningful during the walk; once it ends there is no operation left to cancel.

## Capabilities and Constraints

- Desktop-first Tauri 2 application with React/Vite frontend and Rust backend.
- Scanner coverage spans the dependency, build and cache directories of every ecosystem the product claims to support; `docs/SCANNERS.md` is the authority on which, and is the only place the list is written down.
- Every detected artifact is confirmed by its ecosystem's marker file sitting beside it, and artifacts that only count in one place are declared as paths relative to the project root rather than as bare directory names.
- No virtual environment and no fetched-dependency directory is ever a target where restoring it costs network rather than a local build.
- Every workspace scanner runs unconditionally. Excluding something inside a workspace is an ignore rule, which reaches every category and wins against the provider, the confidence and a schedule. Settings § Scanning covers only what lives outside the chosen folders: package manager, AI tool and editor caches.
- Beside the reason for reclaiming a project, the interface states what putting it back would take: the package manager, the command, and the file that fixes which versions return. When nothing pins them, it says so — the space comes back and that exact set of dependencies does not. The command is printed, never run: installing writes to the project and reaches the network, which is a different product from removing a directory.
- A project's own page names which kinds of artifact its reclaimable weight is made of, heaviest first, as a proportional bar that totals the figure above it; kinds too small to draw are summed into one remainder rather than dropped. The project list can be read grouped by verdict, which is the default, or ranked by weight on disk; a ranked row carries its own verdict, because nothing else states it there.
- A measurement the walk could not complete is never presented as a total, and a project list cut short by the discovery cap says so. A figure the product cannot stand behind carries a floor mark instead of being printed plain.
- The reclaim list opens ordered by how sure the scanner is, least certain first, and can be ranked by weight on disk instead. Which order is on is a visible control that says what each one means, because the ordering is the product's opinion and a list that reorders silently reads as arbitrary. On Free, what the plan can clean comes first under either order.
- A directory holding more than one indexed project is named as such, and both readings of the workspace use it: the list can be grouped by it, and a row carries the directory rather than the folder the user chose, which every project shares. The interface says which kind it is — a tool that declares those projects one workspace, or a directory somebody filed them in — because the first is a fact about how they build and the second is a habit. Neither the chosen folder nor any other container is one of these: everything indexed shares the chosen folder by definition, and the folder someone keeps their projects in is a place rather than a piece of work. A directory gives itself away as a container by holding another such group, since these do not nest, or by holding more projects than one piece of work plausibly is — unless a tool declares it, where nothing is being inferred and no limit applies.
- The project list narrows by folder, by text, by verdict, by which kind of artifact a project holds, and to projects that are a second copy of a repository already checked out elsewhere. The filters compose, and every one that is on is named above the list with the way to lift it, because a screen showing four of a hundred and forty projects has to say why. Clearing clears all of them.
- A finding on the Insights screen offers a destination only where the workspace can actually filter for it. Following one clears the other filters first, so the list that opens matches the sentence that sent the reader there. A finding with nowhere to lead is a sentence, never a button.
- Every verb the keyboard reaches is a named action with a shipped key, and on macOS the menu bar offers the same names with the same keys. Only there: the window draws its own titlebar and has no frame for a menu to hang from, which macOS does not need because its menu bar belongs to the screen. Every key works on every platform regardless, `Command` reading as `Control` where there is no Command key — one list, so the key printed beside a menu item is the one the app honours. Settings lists them all with what each does, and a key is rebound by pressing the new one rather than by writing it — two commands left sharing a key are reported rather than resolved, because which of them answers is not something the app decides. A key can also be rebound in `settings.json` by naming the action; the shipped defaults are not stored there, so a rebinding survives an update that changes one and an entry for an action that no longer exists is dropped rather than obeyed. A key with no modifier is never printed in the menu, because the system would claim it and the key would stop reaching what it was for.
- A command palette reaches every project and every module from the keyboard, and is where a project is opened in an editor, a terminal or the file manager. A project row opens that project's own page: the evidence behind its verdict, its git and activity context, and the artifacts under it, each reclaimable on its own. Opening is a native command: it refuses any path outside the chosen folders, and any application the machine was not found to have. Which editor and which terminal is a preference chosen from what was detected — never typed — because no platform exposes a default an app opening a directory could read; left automatic, the editor built for the project's own language leads, then any general-purpose one. A right-click on a project row offers the same verbs, and never a reclaim: the page is where removing happens.
- The project list has a second reading on Pro: the workspace as one picture. A project is a circle whose area is what it weighs and whose colour is its verdict; a package installed separately in more than one project is a circle of its own, with a line to each project holding a copy, because that is the fact a list of projects has nowhere to put. Projects sharing a directory are drawn as one chain under that directory's name, and two checkouts of one repository are joined. The picture states what is on it: a workspace where nothing is shared says so rather than printing a legend for lines it does not have. It is navigable: drag to move it, pinch or scroll to zoom, and closing in asks for the names it was too crowded to print. The picture is computed rather than settled by simulation, so the same workspace always draws the same way; it reads whatever the filters have narrowed to, and grows outward rather than tightening, so a larger workspace is a larger picture at the same node size rather than the same picture with everything halved. The list stays the default and stays the only way through by keyboard. Which of the two opens sits in the workspace header beside the order, and is remembered between visits — the control belongs next to what it changes, and the answer belongs in the settings file whether or not the settings screen shows it.
- `Docker` exists in the category model but has no scanner implementation, and is priced Free for exactly that reason: a plan never charges for a capability that finds nothing.
- A project's own page reports what its repository is carrying that nothing uses: local branches whose remote branch was deleted, forgotten stashes, and worktrees whose directory is gone. Only a branch `git branch -d` would accept is offered for deletion; one holding commits reachable from nowhere else is named and left alone. Stashes and worktrees are reported and never acted on.
- The workspace is read again when the window comes back and when the disk says something under the chosen folders changed, and never while a scan or a cleanup is running, because those are the app writing the tree it would re-read. What is watched is bounded on purpose: a chosen folder, what is in it, and what is in those — deep enough to see a project or a build directory appear and shallow enough that a build or a dev server running inside the chosen folder is invisible, which it has to be, or the app re-reads the workspace for as long as somebody is working. Nothing is reported until the disk has been quiet either, so an install writing ten thousand files is one reading afterwards rather than ten thousand during.
- Opening Insights is the request for insights: the three deeper readings — duplicated dependencies, repository hygiene, and build folders nothing owns — are taken once the workspace has settled, in that order, cheapest first, and held for as long as the workspace does so leaving the screen does not pay for them again. One control re-reads all three.
- Insights opens with the workspace as one picture: how many projects, what they weigh, what remains once every artifact is gone, which kinds of artifact the weight is made of, and how many projects sit under each verdict. Projects still being weighed are named as pending rather than folded in as nothing, so the figures do not climb while they are read. It is the same on every plan.
- Insights answers the same question across the workspace, offline: which repositories are carrying dead branches, forgotten stashes or worktrees whose folder is gone. It lists them and hands the reader to a project's own page; deleting stays there, one repository at a time.
- Fetching a repository is the only network operation in the product, is never automatic, and runs with credential prompting disabled. `pull` is not offered: it merges into a working tree, and nothing here writes to one.
- A maintenance policy selects idle projects by verdict, age and size, and Pro runs it — on demand, and on a schedule with nobody present. A scheduled run obeys the same policy, goes through the same cleanup command as a click, always moves to the Recycle Bin/Trash, is recorded in history as started by a schedule, and notifies the user the same day. The schedule is off until switched on, and yields to any scan the user started. It is a thread inside the running application rather than a system service: closing the window keeps it when the app is set to stay in the menu bar, quitting ends it, and a missed run happens the next time the app opens. A schedule enabled while the app is set to quit on close is reported as the contradiction it is, beside the switch that caused it.
- Insights reports build directories under the chosen folders that no project claims — the leftovers of a project that was deleted. It is read-only on every plan and says why: an artifact is only ever a target when the file that owns it sits beside it, and that check is precisely what an orphan fails. A directory qualifies either because its name means only one thing, or because a file inside it identifies the tool that wrote it. An abandoned virtual environment is named as the exception it is: nothing can rebuild one without the project's dependency file, so it is dead weight for the opposite reason to everything else. Each finding opens in the file manager, where removing it is the user's decision.
- A project's own page names the packages it keeps its own copy of that other projects also keep, with what one copy costs and how many projects hold it. Read-only, and it says why: a package taken out of one project is a broken install rather than a reclaim, and the directory holding it is already offered below.
- Insights reports the same package installed once per project, as a measured total and a list. It is read-only and offers no removal: a project whose packages are links into a shared store is not duplicating anything and is reported as already sharing them, rather than counted as waste.
- Scanner coverage grows release to release. Copy must never enumerate it in prose — see `DESIGN.md` § Voice & Copy.
- Default cleanup moves targets to the native Recycle Bin/Trash.
- Permanent deletion exists as a destructive backend mode and requires exact `Nuke` confirmation.
- Backend canonicalizes paths, rejects symlinks and critical roots, enforces scan-root scope, and protects against arbitrary frontend paths.
- Targets are held in memory and become invalid when the application restarts.
- Current desktop window is resizable and undecorated, and the app is inset from its edges by a transparent gutter its shadow falls into. The visible app starts at 1080x800 and has an 800x600 minimum; the window itself carries the gutter on top, and drops it while maximized or fullscreen.
- Default appearance is light. Dark and system-follow are opt-in from Settings § Appearance.
- The interface's colours are twenty-one named tokens. Several themes ship with the app, compiled into it so one the user deleted does not reappear on the next launch; a theme is otherwise a file in the user's own configuration folder that renames some of them and leaves the rest — partial on purpose, so a theme written today still works on a release that adds a colour. A theme carries a light palette, a dark one, or both. With both, choosing between them stays the user's; with one, the appearance follows the theme and the other choices are shown as unavailable rather than offered and overruled — a file of dark colours read over the light palette is nineteen light surfaces and two dark ones, and a control that keeps its selection while changing nothing is the other failure. The older shape, one palette with its mode named at the top, keeps working: it is the same thing with one mode. A value that is not a colour is dropped and named rather than applied; a token this app does not have is named too. A file wins over a shipped theme of the same name, which is what makes copying one and changing a colour a thing that works. That folder is the one holding `settings.json` — under the user's own account on every platform, wherever the system keeps one — it opens from Appearance, and both are read again when the window regains focus, which is the gesture anyone editing them is already making.
- Cleanup completion may celebrate confirmed results with positive copy, reclaimed-byte emphasis, animation, and confetti. Active, failed, and cancelled states remain factual.

## Brand Commitments

- Product name: Uncached.
- Tagline: "Reclaim disk from build artifacts." Used in metadata, the About panel, and any header subtitle.
- Voice: spec-terse and developer-facing during operations. No metaphor, lifestyle framing, emotional reassurance, or exclamation marks near destructive actions. Confirmed success may use positive language and celebration.
- Product term for a detected disposable directory is **target**, not "finding" or "item". The scanned root is the **workspace** — it names the first step, the primary action (`Scan workspace`), and the back affordance. Keep one term per concept across UI, docs, and metadata.
- The app describes itself to the operating system it installs into: a publisher, a copyright, a category, and a sentence about what it does, which is what a system's own list of background items reads to name it. What no metadata can supply is attribution — an unsigned build is an unidentified developer on macOS and an unknown publisher on Windows, and only a certificate changes that.
- Preserve existing Uncached logo and icon assets in `public/brand`.
- Preserve desktop-first Tauri architecture.

## Evidence on Hand

- Product documentation: `README.md`, `docs/ARCHITECTURE.md`, `docs/SCANNERS.md`, `docs/CLEANERS.md`, `docs/IPC.md`.
- Existing logo and icon assets: `public/brand/`.
- No customer testimonials, benchmark claims, or external proof are established; future work must not fabricate them.

## Product Principles

- Make cleanup safe by default.
- State what will happen before it happens, in bytes and paths.
- Keep scan and cleanup operations responsive.
- Treat backend authorization as the source of truth.
- Reclaim space without disrupting developer workflow.
- Report, do not reassure: measurements and consequences instead of comfort.
- Never invent progress, sizes, or outcomes the backend has not reported.
- Celebrate only cleanup outcomes confirmed by the backend.
- Name the phase the backend is actually in, including the ones between the obvious steps.
- Offer a control only while its operation exists; never dress a dead control as status.
