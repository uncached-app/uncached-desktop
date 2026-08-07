---
name: Uncached
description: Reclaim disk from build artifacts.
colors:
  forest-night: "#101311"
  forest-surface: "#151b17"
  forest-raised: "#1a211c"
  forest-border: "#222b24"
  fresh-sage: "#b9d98d"
  fresh-sage-light: "#d1eca9"
  sage-deep: "#a8c982"
  mist-primary: "#edf0eb"
  mist-secondary: "#c7d0c1"
  mist-muted: "#8e998e"
  warning-coral: "#ffc2b5"
  light-canvas: "#f4f6f1"
  light-surface: "#ffffff"
  light-raised: "#eef2eb"
  light-border: "#dfe7dc"
typography:
  display:
    fontFamily: "Hanken Grotesk, sans-serif"
    fontSize: "clamp(3rem, 5vw, 3.75rem)"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.05em"
  headline:
    fontFamily: "Hanken Grotesk, sans-serif"
    fontSize: "clamp(1.875rem, 4vw, 2.25rem)"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.04em"
  title:
    fontFamily: "Hanken Grotesk, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.25
  body:
    fontFamily: "Hanken Grotesk, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Hanken Grotesk, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
  mono:
    fontFamily: "Geist Mono, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
  xl: "1.5rem"
  pill: "9999px"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
  xl: "1.5rem"
  section: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.fresh-sage}"
    textColor: "{colors.forest-night}"
    rounded: "{rounded.md}"
    padding: "0.6875rem 1.25rem"
  button-destructive:
    backgroundColor: "{colors.warning-coral}"
    textColor: "{colors.forest-night}"
    rounded: "{rounded.md}"
    padding: "0.625rem 1rem"
  button-secondary:
    backgroundColor: "{colors.forest-raised}"
    textColor: "{colors.mist-secondary}"
    rounded: "{rounded.md}"
    padding: "0.625rem 1rem"
  input-path:
    backgroundColor: "{colors.forest-surface}"
    textColor: "{colors.mist-primary}"
    rounded: "{rounded.lg}"
    padding: "0.75rem 1rem"
  finding-card:
    backgroundColor: "{colors.forest-surface}"
    textColor: "{colors.mist-secondary}"
    rounded: "{rounded.lg}"
    padding: "1rem"

---

# Design System: Uncached

## Overview

**Creative North Star: "Quiet Forest Utility"**

Uncached is a quiet surface running a destructive operation. The visual system is calm on purpose: a dark evergreen canvas, layered tonal surfaces, and pale sage for safe forward motion give scanning, review, and confirmation room to be read without turning cleanup into a spectacle.

**The calm is visual only.** Surfaces, spacing, color, and motion are restrained; the language is not soft. Copy is written for developers who already know what `node_modules` is and want counts, paths, byte sizes, and consequences — not encouragement. See **Voice & Copy** below; that section governs every string, and no visual rule here licenses warmth in text.

Technical information such as paths, categories, and sizes uses a distinct monospace voice; explanation stays humanist and readable, but never chatty. Tonal surfaces do most of the structural work, with color reserved for meaningful state.

**Key Characteristics:**
- Deep evergreen canvas with layered forest surfaces.
- Pale botanical green for safe, affirmative actions.
- Soft coral for destructive or cancelling actions.
- Rounded, tactile controls with compact developer-tool density.
- Quiet motion that clarifies transitions and progress.
- Flat, factual copy: real artifact names, exact counts, stated consequences.

## Colors

Deep Forest + Fresh Sage creates a low-noise, safety-oriented palette. The dark theme is canonical; the existing light theme inverts the same roles into a pale neutral canvas.

### Primary
- **Fresh Sage** (`#b9d98d`): Primary action, active progress, selected state, and safe confirmation.
- **Fresh Sage Light** (`#d1eca9`): Hover and higher-contrast affirmative emphasis on dark surfaces.

### Secondary
- **Warning Coral** (`#ffc2b5`): Cancel, delete, permanent deletion, and other actions with destructive consequence.

### Neutral
- **Forest Night** (`#101311`): App canvas, titlebar, and deepest layer.
- **Forest Surface** (`#151b17`): Main cards, dialogs, and input surfaces.
- **Forest Raised** (`#1a211c`): Hover surfaces and secondary controls.
- **Forest Border** (`#222b24`): Dividers, outlines, and quiet boundaries.
- **Mist Primary** (`#edf0eb`): Primary text and high-importance values.
- **Mist Secondary** (`#c7d0c1`): Supporting text and secondary controls.
- **Mist Muted** (`#8e998e`): Hints, metadata, labels, and inactive states.

### Named Rules
**The Signal Scarcity Rule.** Sage and coral are state signals, not decoration. Use them where users need to understand what is safe, active, selected, cancelling, or destructive.

Coral in particular is a promise that something can be cancelled or destroyed. A coral surface that carries no action — a disabled button repurposed as a progress label — spends the signal on nothing and teaches users to stop reading it.

## Typography

**Display Font:** Hanken Grotesk (with sans-serif fallback)
**Body Font:** Hanken Grotesk (with sans-serif fallback)
**Label/Mono Font:** Geist Mono for paths, categories, counts, and technical values.

**Character:** Hanken Grotesk is warm, compact, and highly legible at desktop-tool sizes. Geist Mono creates a precise second voice for filesystem data without making the whole product feel like a terminal.

### Hierarchy
- **Display** (600, `clamp(3rem, 5vw, 3.75rem)`, 1.05): Workspace entry headline.
- **Headline** (600, `clamp(1.875rem, 4vw, 2.25rem)`, 1.1): Review and scan-state headings.
- **Title** (600, `1.25rem`, 1.25): Dialog and settings headings.
- **Body** (400, `1rem`, 1.6): Explanatory copy and empty states.
- **Label** (500, `0.75rem`, 1.4): Metadata, progress steps, and quiet status text.
- **Mono** (400, `0.875rem`, 1.5): Paths, numeric counts, categories, and version information.

### Named Rules
**The Two-Voice Rule.** Humanist type explains; monospace type identifies filesystem facts. Do not use mono for general prose, and do not use mono decoratively to make ordinary text look technical.

## Voice & Copy

**Register: spec-terse.** Write the way a good CLI writes its `--help` and a good tool writes its release notes. The reader is a developer on their own machine who chose a disk-cleanup tool; they want the numbers and the consequence, not reassurance.

### Rules

- **Name the real thing.** `node_modules`, `target/`, `__pycache__`, `.gradle`, `Recycle Bin`, bytes, directories. Never "clutter", "junk", "stuff you don't need".
- **Never enumerate the scanners in prose.** Scanner coverage grows; a hardcoded list of artifact names becomes a lie on the next release and cannot be caught by a type checker. Describe the *class* — "dependency, build, and cache directories your toolchains can regenerate" — and let real artifact names appear only where they come from live data: category chips, target paths, and the Scanning settings toggles.
- **Lead with the fact.** Counts, sizes, paths, and durations come first; explanation second, and only when it changes a decision.
- **One idea, once.** If the heading states the state, the paragraph below it adds new information or is deleted. A subheading restated the heading in different words is the most common failure: under "Scanning workspace", "Walking the directory tree" says nothing — "Targets are measured as they are found" explains the mechanism the user can see running.
- **Accessible names track state.** A region's `aria-label` and a control's accessible name follow the state they describe. A section that announces "Scanning workspace" after the scan finished is reporting a state that no longer exists.
- **State consequences flatly.** Destructive copy names the object, the destination, and the recoverability — as fact, not as caution. "Deleted permanently. Not recoverable." beats "Careful! This can't be undone."
- **Controls name their operation**, not the gesture: `Scan workspace`, `Delete permanently`, `Move to Recycle Bin`, `Back to Workspace`.
- **Do not churn working strings.** This register is about removing metaphor and reassurance, not about restating labels that already say the right thing in the product's own words.
- **Errors name what failed and what to do**, and may quote the exact runtime or path detail. Internal error strings are acceptable to surface; vague apologies are not.
- **Progress is measured, never invented.** Report real directory counts, target counts, and elapsed milliseconds.

### Banned in copy

- Metaphor and lifestyle framing: "make room for what matters", "breathe", "a calmer way", "tidy", "declutter", "spring cleaning".
- Emotional reassurance and praise: "Nice work", "All set!", "Don't worry", "You're all clean".
- Exclamation marks, second-person cheerleading, and jokes anywhere near a delete path.
- Filler openers ("Let's", "Just", "Simply") and hedges ("might", "should be able to").
- Vague nouns where a real one exists: "items" when the product term is **targets**, "space" when a byte count is available.

### Terminology (use exactly these)

| Concept | Term | Never |
|---|---|---|
| A detected disposable directory | **target** | finding, item, result, hit |
| The scanned root, as a concept | **workspace** | project, repo, directory tree |
| The scanned root, as a value the user picks or pastes | **folder** / **path** | location, destination |
| Walking the tree | **scan** | search, look, hunt |
| Removing a target | **clean up** (flow), **delete** / **move to Recycle Bin** (action) | remove, purge, wipe, nuke¹ |
| Bytes recovered | **reclaimed** | saved, freed up, gained |

¹ `Nuke` is the literal confirmation token required by the backend for permanent deletion. It is a typed value, never prose.

### Named Rules
**The No-Comfort Rule.** Calm belongs to the surface, never to the sentence. If a string reads as if it is managing the user's feelings, rewrite it as a measurement or a consequence.

## Layout

The desktop shell is a full-height, centered workspace with a maximum content width of 72rem. A 3rem titlebar anchors the app; the main workflow occupies the flexible center; the footer keeps settings available without competing with the task. Horizontal padding grows from `1.25rem` to `3rem` across the existing responsive breakpoints.

The entry state centers one clear decision: choose a folder, then scan. Review state shifts into a dense, scrollable list with a persistent heading and action row. Dialogs use centered bounded surfaces. On narrow widths, progress navigation collapses and multi-column target cards stack.

Spacing follows a compact rhythm built from `0.25rem`, `0.5rem`, `0.75rem`, `1rem`, `1.5rem`, and `2rem` intervals. Keep action groups legible rather than filling available space.

## Elevation & Depth

This is a tonal-layering system. Depth comes primarily from Forest Night, Forest Surface, Forest Raised, and Forest Border relationships, not from persistent shadows. Dialogs may use a strong ambient shadow because they interrupt the workflow; ordinary cards should remain grounded. A subtle fixed grain texture adds material continuity without becoming a visible pattern.

### Named Rules
**The Grounded Surface Rule.** Cards and controls sit in the forest layers. Do not float every element with a shadow; reserve lift for modal interruption and meaningful focus.

## Shapes

The form language is gently curved and tactile: compact controls use `0.75rem` radii, cards and dialogs use `1rem` to `1.5rem`, and progress steps use pill geometry. Borders are quiet and usually one tonal step lighter than their surface. Inputs have a generous rounded container, while technical tags use smaller corners to read as metadata rather than buttons.

## Components

### Buttons
- **Shape:** Soft, compact corners (`0.75rem`) with a subtle pressed translation.
- **Primary:** Fresh Sage fill, Forest Night text, semibold label, minimum 2.75rem height.
- **Destructive:** Warning Coral fill, Forest Night text; use only for cancellation, deletion, or permanent consequences.
- **Secondary:** Forest Raised fill with Mist Secondary text; hover one layer lighter and Sage text when relevant.
- **Hover / Focus:** Shift surface or border color; use a visible Sage focus ring on keyboard focus. Active state translates down 1px and scales to `0.99`.
- **Disabled vs. absent:** `disabled` means "this operation exists but is momentarily unavailable" — a scan is cancelling, a size is still resolving. When the operation does not exist at all in the current state, remove the control instead of disabling it and relabelling it. A button is never a status readout.
- **Reserved space:** where a control appears and disappears with state, hold its slot with a `min-height` so the layout does not jump. The stillness is part of the calm; a shifting column is not.

### Named Rules
**The Live Control Rule.** Every button on screen names an operation the user can actually invoke now, or is momentarily disabled awaiting one. Progress, phase, and outcome belong to headings, status lines, and stat blocks — never to a dead control wearing an action's color.

### Cards / Containers
- **Corner Style:** Rounded `1rem` to `1.5rem`.
- **Background:** Forest Surface over Forest Night canvas.
- **Shadow Strategy:** Flat at rest; modal containers can use ambient shadow.
- **Border:** Forest Border by default; Sage border when a target is selected or a surface is actively focused.
- **Internal Padding:** Usually `1rem`; larger empty states and dialogs use `1.5rem`.

### Inputs / Fields
- **Style:** Forest Surface fill, Forest Border outline, `1rem` radius, and a monospace value field for paths.
- **Focus:** Sage border with a low-opacity Sage ring.
- **Error / Disabled:** Coral text for errors; preserve surface structure while reducing opacity for disabled controls.

### Navigation
- **Style:** Progress pipeline uses compact pill labels with numbered circular markers. Current step receives a Forest Raised capsule and Sage marker; passed steps use Mist Secondary and a Sage check; future steps stay muted.
- **Desktop / Narrow treatment:** Pipeline is visible at desktop widths and collapses on narrow widths. Tauri titlebar controls remain compact, square, and separate from workflow navigation.

### Target Card
Target cards pair a selectable checkbox, a small monospace category chip, a truncated monospace path, and a right-aligned size. Selected cards use a Sage border and retain the same grounded surface. The design token is still named `finding-card`; the user-facing term is always **target**.

## Do's and Don'ts

### Do:
- **Do** preserve Deep Forest surfaces and use tonal contrast before adding decoration.
- **Do** reserve Fresh Sage for safe action, progress, selection, and focus.
- **Do** use Geist Mono for paths, categories, counts, and other filesystem facts.
- **Do** keep destructive actions unmistakably Coral and explicit.
- **Do** respect reduced-motion preferences and keep transitions short.
- **Do** write every string in the spec-terse register: real artifact names, exact counts, stated consequences.
- **Do** keep one term per concept across UI, docs, and metadata (see the terminology table).

### Don't:
- **Don't** introduce generic neon gradients, cyberpunk glow, or terminal-green spectacle.
- **Don't** use coral as a general accent or interchangeable brand color.
- **Don't** make every container shadowed or floating.
- **Don't** turn technical metadata into decorative typography.
- **Don't** replace the Uncached logo assets with improvised marks.
- **Don't** let the quiet visual world leak into the writing as warmth, metaphor, or reassurance.
- **Don't** celebrate. Completion states report what was removed and what was reclaimed.
