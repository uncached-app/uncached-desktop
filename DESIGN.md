---
name: Uncached
description: A calmer way to reclaim space from developer workspaces.
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

Uncached is a calm, grounded instrument for a risky task. Its dark evergreen canvas makes the workspace feel protected, while pale sage signals safe forward motion. The interface is deliberately quiet: it gives scanning, review, and confirmation enough room to be understood without turning cleanup into a spectacle.

The system uses soft edges and restrained texture to make developer tooling feel approachable without becoming playful. Technical information such as paths, categories, and sizes uses a distinct monospace voice; action and explanation remain humanist and readable. Tonal surfaces do most of the structural work, with color reserved for meaningful state.

**Key Characteristics:**
- Deep evergreen canvas with layered forest surfaces.
- Pale botanical green for safe, affirmative actions.
- Soft coral for destructive or cancelling actions.
- Rounded, tactile controls with compact developer-tool density.
- Quiet motion that clarifies transitions and progress.

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
**The Two-Voice Rule.** Humanist type explains and invites; monospace type identifies filesystem facts. Do not use mono for general prose.

## Layout

The desktop shell is a full-height, centered workspace with a maximum content width of 72rem. A 3rem titlebar anchors the app; the main workflow occupies the flexible center; the footer keeps settings available without competing with the task. Horizontal padding grows from `1.25rem` to `3rem` across the existing responsive breakpoints.

The entry state centers one clear decision: choose a folder, then scan. Review state shifts into a dense, scrollable list with a persistent heading and action row. Dialogs use centered bounded surfaces. On narrow widths, progress navigation collapses and multi-column finding cards stack.

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

### Cards / Containers
- **Corner Style:** Rounded `1rem` to `1.5rem`.
- **Background:** Forest Surface over Forest Night canvas.
- **Shadow Strategy:** Flat at rest; modal containers can use ambient shadow.
- **Border:** Forest Border by default; Sage border when a finding is selected or a surface is actively focused.
- **Internal Padding:** Usually `1rem`; larger empty states and dialogs use `1.5rem`.

### Inputs / Fields
- **Style:** Forest Surface fill, Forest Border outline, `1rem` radius, and a monospace value field for paths.
- **Focus:** Sage border with a low-opacity Sage ring.
- **Error / Disabled:** Coral text for errors; preserve surface structure while reducing opacity for disabled controls.

### Navigation
- **Style:** Progress pipeline uses compact pill labels with numbered circular markers. Current step receives a Forest Raised capsule and Sage marker; passed steps use Mist Secondary and a Sage check; future steps stay muted.
- **Desktop / Narrow treatment:** Pipeline is visible at desktop widths and collapses on narrow widths. Tauri titlebar controls remain compact, square, and separate from workflow navigation.

### Finding Card
Finding cards pair a selectable checkbox, a small monospace category chip, a truncated monospace path, and a right-aligned size. Selected cards use a Sage border and retain the same grounded surface.

## Do's and Don'ts

### Do:
- **Do** preserve Deep Forest surfaces and use tonal contrast before adding decoration.
- **Do** reserve Fresh Sage for safe action, progress, selection, and focus.
- **Do** use Geist Mono for paths, categories, counts, and other filesystem facts.
- **Do** keep destructive actions unmistakably Coral and explicit.
- **Do** respect reduced-motion preferences and keep transitions short.

### Don't:
- **Don't** introduce generic neon gradients, cyberpunk glow, or terminal-green spectacle.
- **Don't** use coral as a general accent or interchangeable brand color.
- **Don't** make every container shadowed or floating.
- **Don't** turn technical metadata into decorative typography.
- **Don't** replace the Uncached logo assets with improvised marks.
