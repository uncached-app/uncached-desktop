---
target: Workspace screen and overall app UX
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
timestamp: 2026-09-30T02-06-21Z
slug: src-components-workspace-workspacemap-tsx
---
Method: dual-agent (A: design review · B: detector)

## Heuristics — 26/40 (Acceptable)
1 Status 3 (lifetime total labelled "Última execução") · 2 Real world 3 ("Apagar" moves to Trash; "Cache a liberar" for node_modules) · 3 Control 3 · 4 Consistency 2 (Reclaim is tab and stepper step; four "a liberar" figures) · 5 Error prevention 3 (Protect rows show green reclaim bars) · 6 Recognition 2 (5/7 icon-only buttons, unlabelled chip groups) · 7 Efficiency 3 · 8 Minimalism 2 (~13 header controls) · 9 Recovery 3 · 10 Help 2.

## Specificity
~75% product-specific (verdict panel, restore line, mono for filesystem facts). Generic: KPI card grid, decorative badges, the graph. Detector: 133 advisory design-system-font-size findings (text-[10px]/[11px] across 40+ files; one SVG 9px false positive) — an unrecorded micro type tier.

## Priority issues
- P1 Numbers disagree: record_cleanup accumulates forever but WorkspaceForm labels it "Última execução" (137,88 GB > lifetime 118,48 GB from cleanup_history); Insights 0 B + "↘100%" with history; "Removível" (purgeable) vs "a liberar".
- P1 Reclaim vs "free disk fast": headline includes 22,69 GB in use; least-certain-first opens on KB rows; "Apagar" for Trash; unlabelled Idade/Ordem chips.
- P2 Workspace header overload (WorkspaceHeader.tsx): collapse folder actions into "Abrir em…", truncations, "6 em risco" duplicates sidebar.
- P2 Protect group mixed signals (VerdictGroup/ProjectRow): green reclaim bars beside coral Protect.
- P2 ActionButton tooltip has no focus variant despite comment; 7 unlabelled icons on project page.

## Map recommendation
Remove. Verdict/size duplicated by list; directory groups = "Por pasta"; clones = filter; shared packages = 12 of 659 drawn, not actionable. Not keyboard/screen-reader usable; draws poorly (cropped hub, overlapping labels, no verdict legend). Replace: Insights → Duplicates shows projects per package + package-as-filter facet in Workspace. Pro value shifts accordingly.

## Personas
Power user: spots 137>118; no multi-select-to-reclaim. Keyboard/SR: map is role=img and persists; hover-only tooltips; 10-11px labels. 20+ repo dev: opens on Workspace with Protect first; Reclaim least-certain first; inflated headline.

## Minor
Redundant window titles; stepper only on Reclaim; "0 projeto elegível"; "Restaurando:" → "Para restaurar:"; sidebar cut-off; hardcoded "Shared package".
