import { Maximize2, Minus, Plus } from "lucide-react";
import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useMapGestures } from "./useMapGestures";
import { nodeRadius, type GraphEdge, type GraphNode, type WorkspaceGraph } from "../../../utils/graph.mjs";
import { formatBytes } from "../../../utils/format.mjs";
import { VERDICT_PRESENTATION } from "../verdictPresentation";
import type { Footprint, Verdict, WorkspaceProject } from "../../../types/workspace";

/** Height of the drawing, in the coordinates the SVG uses. Width follows it. */
const SIDE = 1000;

type WorkspaceCanvasProps = {
  /** Built by the caller, which is also what decides this can be drawn at all. */
  graph: WorkspaceGraph;
  projects: WorkspaceProject[];
  footprints?: Record<string, Footprint>;
  verdicts?: Record<string, Verdict>;
  /** The duplicate reading has not finished, so the middle is not final. */
  analysing: boolean;
  measuring: boolean;
  /** How tall the drawing area is on screen, in pixels. */
  viewportHeight: number;
  onOpenProject: (path: string) => void;
  onContextMenu: (project: WorkspaceProject, event: React.MouseEvent) => void;
};

type NodeStyle = {
  fill: string;
  stroke: string;
  dotColor: string;
  label: string;
};

/**
 * Resolves theme-adaptive solid surface & stroke tokens from the app's design system.
 * Perfectly adapts across Light and Dark modes without hardcoded saturated hexes.
 */
function getNodeStyle(node: GraphNode, verdicts: Record<string, Verdict>): NodeStyle {
  if (node.kind === "package") {
    return {
      fill: "var(--color-pro-surface)",
      stroke: "var(--color-pro-200)",
      dotColor: "var(--color-pro-200)",
      label: "Shared package",
    };
  }

  const verdict = node.path ? (verdicts[node.path] ?? node.verdict ?? "unknown") : (node.verdict ?? "unknown");
  switch (verdict) {
    case "protect":
      return {
        fill: "var(--color-coral-surface)",
        stroke: "var(--color-coral-300)",
        dotColor: "var(--color-coral-300)",
        label: "Protect",
      };
    case "safe":
      return {
        fill: "var(--color-confidence-high-surface)",
        stroke: "var(--color-confidence-high)",
        dotColor: "var(--color-confidence-high)",
        label: "Safe to reclaim",
      };
    case "tradeOff":
      return {
        fill: "var(--color-confidence-review-surface)",
        stroke: "var(--color-confidence-review)",
        dotColor: "var(--color-confidence-review)",
        label: "In use",
      };
    case "broken":
      return {
        fill: "var(--color-confidence-medium-surface)",
        stroke: "var(--color-confidence-medium)",
        dotColor: "var(--color-confidence-medium)",
        label: "Needs install",
      };
    case "staleDeps":
      return {
        fill: "var(--color-confidence-medium-surface)",
        stroke: "var(--color-confidence-medium)",
        dotColor: "var(--color-confidence-medium)",
        label: "Stale install",
      };
    case "archivable":
      return {
        fill: "var(--color-forest-850)",
        stroke: "var(--color-mist-500)",
        dotColor: "var(--color-mist-500)",
        label: "Fully on remote",
      };
    default:
      // Filled like every other verdict rather than left as the page showing
      // through: on the light theme `forest-900` is white, and a white circle
      // on an off-white canvas is a hole where a project should be.
      return {
        fill: "var(--color-forest-850)",
        stroke: "var(--color-forest-800)",
        dotColor: "var(--color-mist-500)",
        label: "Not established",
      };
  }
}

/**
 * The workspace as an interactive visual map.
 * Clean, modern, minimalist and 100% theme-adaptive (Light and Dark mode).
 */
export function WorkspaceCanvas({
  graph,
  projects,
  footprints = {},
  verdicts = {},
  analysing,
  measuring,
  viewportHeight,
  onOpenProject,
  onContextMenu,
}: WorkspaceCanvasProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  // Where the pointer is, held rather than stored. As state it re-rendered
  // every node and every edge on every mouse move — a hundred and forty
  // projects and four hundred lines, sixty times a second, which is what the
  // freeze was. The tooltip is one element and can be moved directly.
  const pointer = useRef({ x: 0, y: 0 });

  const byId = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph.nodes]);
  const heaviest = useMemo(
    () => ({
      project: max(graph.nodes, "project"),
      package: max(graph.nodes, "package"),
    }),
    [graph.nodes],
  );

  const map = useMapGestures(graph.width * SIDE, SIDE, scaled(graph.extent));
  const active = hovered ? byId.get(hovered) : null;
  // A folder is not a node, so it is not in `byId`. Its badge is hoverable
  // because a directory holding four projects has a weight of its own, and
  // nowhere on this map was saying what it was.
  const activeFamily = hovered ? (graph.labels.find((label) => label.id === hovered) ?? null) : null;
  const familyWeight = useMemo(() => {
    if (!activeFamily) return null;
    return activeFamily.paths.reduce(
      (sum, path) => {
        const footprint = footprints[path];
        return {
          total: sum.total + (footprint?.totalBytes ?? 0),
          reclaimable: sum.reclaimable + (footprint?.reclaimableBytes ?? 0),
          // A folder whose projects are still being weighed is not a folder of
          // that much: the figure is a floor until every one of them is in.
          pending: sum.pending + (footprint ? 0 : 1),
        };
      },
      { total: 0, reclaimable: 0, pending: 0 },
    );
  }, [activeFamily, footprints]);
  const activeProject = active?.path ? projects.find((entry) => entry.path === active.path) : null;
  const activeFootprint = activeProject ? footprints[activeProject.path] : null;

  /**
   * What one layout unit comes to on screen, zoom included.
   *
   * The counter-scale on every name used to be `1 / zoom`, which corrects for
   * the view and not for the frame — and the frame is most of it. A viewBox a
   * thousand units tall drawn into four hundred pixels puts everything at forty
   * percent before the view has done anything, so on the default window a name
   * set at twelve came out under five, and the map read as unlabelled.
   *
   * Quantised, so a continuous zoom redraws the body in steps across its range
   * rather than on every frame of it. Names land within a twentieth of their
   * intended size, which is not a difference anyone can see.
   */
  const onScreen = map.view.scale * (viewportHeight > 0 ? viewportHeight / SIDE : 0.5);
  const labelScale = Math.max(0.05, Math.round(onScreen * 20) / 20);
  const nameEverything = graph.nodes.length <= 34 || onScreen > 0.85;

  const placeTooltip = useCallback(() => {
    const tooltip = tooltipRef.current;
    const container = containerRef.current;
    if (!tooltip || !container) return;
    tooltip.style.left = `${Math.min(
      Math.max(12, pointer.current.x + 14),
      container.clientWidth - 230,
    )}px`;
    tooltip.style.top = `${Math.min(
      Math.max(12, pointer.current.y - 60),
      container.clientHeight - 120,
    )}px`;
  }, []);

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    pointer.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    placeTooltip();
  };

  /**
   * Places the tooltip the moment it attaches, whatever caused it to.
   *
   * A press starts a drag, a drag unmounts the tooltip, and letting go mounts
   * it again — at which point an effect keyed on what is hovered has no reason
   * to run, because nothing about what is hovered changed. The element came
   * back with no `left` or `top` and rendered wherever an unpositioned absolute
   * box lands, which is a tooltip that jumps to a corner when you click.
   *
   * A ref callback fires on every attach, so there is no list of reasons to
   * keep in step with the list of things that can unmount it.
   */
  const attachTooltip = useCallback(
    (node: HTMLDivElement | null) => {
      tooltipRef.current = node;
      if (node) placeTooltip();
    },
    [placeTooltip],
  );

  // And again when the pointer moves to a different node without the tooltip
  // ever leaving the screen, which the attach above never sees.
  useLayoutEffect(placeTooltip, [placeTooltip, hovered]);

  // Stable, so the memoised body is not rebuilt by a new function each render.
  const onEnter = useCallback((id: string) => setHovered(id), []);
  const onLeave = useCallback(
    (id: string) => setHovered((current) => (current === id ? null : current)),
    [],
  );

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-forest-800 bg-forest-950 select-none"
    >
      <svg
        ref={map.ref}
        viewBox={`0 0 ${graph.width * SIDE} ${SIDE}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`${projects.length} projects and ${graph.nodes.length - projects.length} shared packages. The list reads the same workspace.`}
        className={`min-h-0 w-full flex-1 touch-none ${map.dragging ? "cursor-grabbing" : "cursor-grab"}`}
        {...map.handlers}
      >
        {/* Two layers, and that is the optimisation.
            
            Hover used to restyle every element: four hundred lines and a
            hundred and forty circles each recomputing whether they were lit or
            dimmed, on every crossing. The resting picture never changes when a
            pointer moves over it, so it is drawn once and memoised; hovering
            fades that whole layer with one attribute and redraws only what is
            connected on top of it. */}
        <g transform={`translate(${map.view.x} ${map.view.y}) scale(${map.view.scale})`}>
          <g
            className="transition-opacity duration-150"
            style={{ opacity: hovered ? 0.22 : 1 }}
          >
            <MapBody
              graph={graph}
              heaviest={heaviest}
              verdicts={verdicts}
              projects={projects}
              nameEverything={nameEverything}
              showWeights={onScreen > 1}
              labelScale={labelScale}
              onEnter={onEnter}
              onLeave={onLeave}
              onOpenProject={onOpenProject}
              onContextMenu={onContextMenu}
              wasDragged={map.wasDragged}
            />
          </g>

          {hovered && (
            <MapHighlight
              graph={graph}
              byId={byId}
              hovered={hovered}
              family={activeFamily}
              heaviest={heaviest}
              verdicts={verdicts}
              labelScale={labelScale}
            />
          )}
        </g>
      </svg>

      {/* Modern, Minimalist Floating Tooltip on Hover */}
      {activeFamily && familyWeight && !map.dragging && (
        <div
          ref={attachTooltip}
          className="pointer-events-none absolute z-30 flex flex-col gap-2 rounded-xl border border-forest-800 bg-forest-900 px-3.5 py-2.5 text-xs shadow-lg"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="size-2 shrink-0 rounded-full bg-sage-400" />
              <span className="truncate font-semibold text-mist-100">{activeFamily.text}</span>
            </div>
            <span className="shrink-0 rounded bg-forest-850 px-1.5 py-0.5 font-mono text-[10px] text-mist-300">
              {activeFamily.declared ? "workspace" : "folder"}
            </span>
          </div>

          <div className="flex flex-col gap-1 border-t border-forest-800 pt-1.5 text-[11px]">
            <div className="flex items-center justify-between gap-4">
              <span className="text-mist-500">Projects:</span>
              <span className="font-mono font-medium text-mist-100">{activeFamily.members}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-mist-500">On disk:</span>
              <span className="font-mono font-semibold text-mist-100">
                {familyWeight.pending > 0 ? `at least ${formatBytes(familyWeight.total)}` : formatBytes(familyWeight.total)}
              </span>
            </div>
            {familyWeight.reclaimable > 0 && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-mist-500">Reclaimable:</span>
                <span className="font-mono font-semibold text-sage-300">
                  {formatBytes(familyWeight.reclaimable)}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between gap-4">
              <span className="text-mist-500">Held together by:</span>
              <span className="font-medium text-mist-100">{activeFamily.detail}</span>
            </div>
          </div>
        </div>
      )}

      {active && !map.dragging && (
        <div
          ref={attachTooltip}
          className="pointer-events-none absolute z-30 flex flex-col gap-2 rounded-xl border border-forest-800 bg-forest-900 px-3.5 py-2.5 shadow-lg text-xs transition-all duration-75 ease-out"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: getNodeStyle(active, verdicts).dotColor }}
              />
              <span className="truncate font-semibold text-mist-100">{active.label}</span>
            </div>
            <span className="shrink-0 rounded bg-forest-850 px-1.5 py-0.5 font-mono text-[10px] text-mist-300">
              {active.kind === "package" ? "package" : (activeProject?.kind ?? "project")}
            </span>
          </div>

          {/* Details */}
          <div className="flex flex-col gap-1 border-t border-forest-800 pt-1.5 text-[11px]">
            {active.kind === "package" ? (
              <div className="flex items-center justify-between gap-4">
                <span className="text-mist-500">Shared across:</span>
                <span className="font-mono font-medium text-mist-100">{active.detail}</span>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-4">
                <span className="text-mist-500">Status:</span>
                <span className="font-medium text-mist-100">
                  {VERDICT_PRESENTATION[verdicts[active.path ?? ""] ?? active.verdict ?? "unknown"].label}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between gap-4">
              <span className="text-mist-500">Disk footprint:</span>
              <span className="font-mono font-semibold text-mist-100">
                {active.weight === null ? "measuring..." : formatBytes(active.bytes)}
              </span>
            </div>

            {activeFootprint && activeFootprint.reclaimableBytes > 0 && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-mist-500">Reclaimable:</span>
                <span className="font-mono font-semibold text-sage-300">
                  {formatBytes(activeFootprint.reclaimableBytes)}
                </span>
              </div>
            )}
          </div>

          {active.kind === "project" && (
            <div className="border-t border-forest-800 pt-1 text-[10px] text-mist-500 flex justify-between gap-2">
              <span>Click to open</span>
              <span>Right-click for options</span>
            </div>
          )}
        </div>
      )}

      {/* Floating Canvas Controls Dock */}
      <MapControls map={map} />

      {/* Bottom Status & Summary Bar - Fixed height to avoid any layout shifts */}
      <div className="flex h-9 shrink-0 items-center justify-between gap-x-4 border-t border-forest-800 bg-forest-950 px-3.5 text-xs overflow-hidden">
        <div className="flex min-w-0 flex-1 items-center gap-2 truncate">
          {active ? (
            <div className="flex items-center gap-2 truncate">
              <span className="font-semibold text-mist-100 shrink-0">{active.label}</span>

              {active.kind === "package" ? (
                <span className="rounded-md bg-forest-850 px-1.5 py-0.5 font-mono text-[10px] font-medium text-pro-100 shrink-0">
                  {active.detail} · {formatBytes(active.bytes)} shared
                </span>
              ) : (
                <>
                  {activeProject && (
                    <span
                      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.2 font-mono text-[10px] font-medium shrink-0 ${
                        VERDICT_PRESENTATION[verdicts[activeProject.path] ?? active.verdict ?? "unknown"].className
                      }`}
                    >
                      <span
                        className={`size-1.5 rounded-full ${
                          VERDICT_PRESENTATION[verdicts[activeProject.path] ?? active.verdict ?? "unknown"].dotClassName
                        }`}
                      />
                      {VERDICT_PRESENTATION[verdicts[activeProject.path] ?? active.verdict ?? "unknown"].label}
                    </span>
                  )}

                  <span className="font-mono text-[11px] text-mist-300 shrink-0">
                    {active.weight === null ? "measuring..." : formatBytes(active.bytes)}
                  </span>

                  {activeFootprint && activeFootprint.reclaimableBytes > 0 && (
                    <span className="rounded-md bg-forest-900 border border-forest-800 px-1.5 py-0.2 font-mono text-[10px] font-medium text-sage-300 shrink-0">
                      {formatBytes(activeFootprint.reclaimableBytes)} reclaimable
                    </span>
                  )}
                </>
              )}
            </div>
          ) : (
            <span className="truncate text-mist-500">Drag to move, scroll to zoom</span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3 text-mist-500 text-[11px]">
          {measuring && <span className="text-sage-300 font-mono">Weighing...</span>}
          {analysing && <span className="text-mist-400 font-mono">Reading packages...</span>}
          {graph.packagesOmitted > 0 && <span>{graph.packagesOmitted} lighter packages omitted</span>}
        </div>
      </div>
      </div>

      <Legend graph={graph} />
    </div>
  );
}

/**
 * What the marks mean, under the picture rather than inside it.
 *
 * It was one sentence along the bottom of the frame, and the frame is never
 * wide enough for it: a key that ends in an ellipsis has taught nobody
 * anything. Broken into its terms it fits, wraps where it has to, and each one
 * carries the mark it is naming instead of describing it in words.
 *
 * Only what is drawn is named. A workspace where nothing is shared has no key,
 * because there is nothing in the picture a key would help with.
 */
function Legend({ graph }: { graph: WorkspaceGraph }) {
  const marks = [
    !graph.sharesNothing && {
      key: "package",
      swatch: (
        <circle cx="8" cy="8" r="5.5" fill="var(--color-pro-surface)" stroke="var(--color-pro-200)" strokeWidth="1.5" />
      ),
      text: "a package more than one project keeps its own copy of",
    },
    graph.labels.length > 0 && {
      key: "folder",
      swatch: (
        <rect x="1.5" y="2.5" width="13" height="11" rx="4" className="fill-sage-400/15 stroke-sage-400/70" strokeWidth="1.5" />
      ),
      text: "one directory holding several projects",
    },
    graph.edges.some((edge) => edge.kind === "clone") && {
      key: "clone",
      swatch: (
        <line x1="1" y1="8" x2="15" y2="8" stroke="var(--color-coral-300)" strokeWidth="1.5" strokeDasharray="4 3" />
      ),
      text: "one repository checked out twice",
    },
  ].filter(Boolean) as Array<{ key: string; swatch: React.ReactNode; text: string }>;

  if (marks.length === 0) return null;

  return (
    <p className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-1.5 px-1 pt-2.5 text-[11px] leading-5 text-mist-500">
      {marks.map((mark) => (
        <span key={mark.key} className="inline-flex items-center gap-1.5">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
            {mark.swatch}
          </svg>
          {mark.text}
        </span>
      ))}
    </p>
  );
}

/**
 * Zoom in, out, and back to the whole thing.
 */
function MapControls({ map }: { map: ReturnType<typeof useMapGestures> }) {
  const step = (factor: number) => () => {
    const element = map.ref.current;
    if (!element) return;
    const bounds = element.getBoundingClientRect();
    map.zoomBy(factor, {
      clientX: bounds.left + bounds.width / 2,
      clientY: bounds.top + bounds.height / 2,
    });
  };

  const zoomPercent = Math.round(map.view.scale * 100);

  return (
    <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-xl border border-forest-800 bg-forest-900/90 p-1 shadow-xs backdrop-blur-sm">
      <Control label="Zoom in" onClick={step(1.35)}>
        <Plus size={14} aria-hidden="true" />
      </Control>

      <span className="px-1.5 font-mono text-[10px] font-medium text-mist-400 select-none">
        {zoomPercent}%
      </span>

      <Control label="Zoom out" onClick={step(1 / 1.35)}>
        <Minus size={14} aria-hidden="true" />
      </Control>

      {(map.moved || map.overflows) && (
        <>
          <div className="h-3.5 w-px bg-forest-800 mx-0.5" />
          <Control label="Fit whole workspace" onClick={map.fit}>
            <Maximize2 size={13} aria-hidden="true" />
          </Control>
        </>
      )}
    </div>
  );
}

function Control({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="grid size-6.5 place-items-center rounded-lg text-mist-500 transition-colors hover:bg-forest-850 hover:text-mist-100 cursor-pointer"
    >
      {children}
    </button>
  );
}


/** The drawing's own rectangle, in the coordinates the SVG uses. */
function scaled(extent: WorkspaceGraph["extent"]) {
  return {
    x: extent.x * SIDE,
    y: extent.y * SIDE,
    width: extent.width * SIDE,
    height: extent.height * SIDE,
  };
}

/** Long enough to recognise, short enough not to collide with the next one. */
function clip(label: string): string {
  return label.length > 22 ? `${label.slice(0, 21)}…` : label;
}

function max(nodes: GraphNode[], kind: GraphNode["kind"]): number {
  return nodes.reduce((top, node) => (node.kind === kind ? Math.max(top, node.weight ?? 0) : top), 0);
}

type BodyProps = {
  graph: WorkspaceGraph;
  heaviest: { project: number; package: number };
  verdicts: Record<string, Verdict>;
  projects: WorkspaceProject[];
  nameEverything: boolean;
  showWeights: boolean;
  labelScale: number;
  onEnter: (id: string) => void;
  onLeave: (id: string) => void;
  onOpenProject: (path: string) => void;
  onContextMenu: (project: WorkspaceProject, event: React.MouseEvent) => void;
  wasDragged: () => boolean;
};

/**
 * The picture at rest, which is almost always the picture.
 *
 * Memoised on what actually changes it — the graph, whether names are being
 * shown, and the zoom rounded to a tenth. A pointer moving across it changes
 * none of those, so none of this is rebuilt while one does.
 */
const MapBody = memo(function MapBody({
  graph,
  heaviest,
  verdicts,
  projects,
  nameEverything,
  showWeights,
  labelScale,
  onEnter,
  onLeave,
  onOpenProject,
  onContextMenu,
  wasDragged,
}: BodyProps) {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const centre = { x: (graph.width * SIDE) / 2, y: SIDE / 2 };

  return (
    <>
      {graph.edges.map((edge) => {
        const from = byId.get(edge.from);
        const to = byId.get(edge.to);
        if (!from || !to) return null;

        return (
          <path
            key={edge.id}
            d={edgePath(from, to, centre, edge.kind)}
            fill="none"
            stroke={EDGE_STROKE[edge.kind]}
            strokeWidth={edge.kind === "clone" ? 1.4 : 1}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            strokeDasharray={edge.kind === "clone" ? "6 5" : undefined}
            opacity={RESTING_EDGE[edge.kind]}
          />
        );
      })}

      {graph.labels.map((label) => (
        <path
          key={`outline:${label.id}`}
          d={outlinePath(label)}
          className="fill-sage-400/8 stroke-sage-400/45"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      ))}

      {graph.labels.map((label) => {
        // Sized by the hole it sits in rather than by the screen. The badge
        // before this was a fixed 150 by 36 pixels, counter-scaled — a screen
        // object in a world-sized gap, and the two only met at two and a half
        // times zoom. A name measured against the cluster fits by construction,
        // at every zoom, and stops being drawn only when the cluster itself is
        // too small on screen to read anything in.
        const hole = Math.max(0, label.reach * SIDE - graph.maxRadius * SIDE);
        // The hole is a radius and the name spans its diameter, which the first
        // version of this halved by accident — a name at half the size it had
        // room for, needing twice the zoom to be worth drawing.
        const font = Math.min(hole * 0.62, (hole * 3.2) / Math.max(label.text.length, 5));
        // The target exists whether or not the name is large enough to draw:
        // what the pointer is asking about is the folder, and the folder is
        // there at every zoom.
        const named = font * labelScale >= 9;

        return (
          <g
            key={label.id}
            onMouseEnter={() => onEnter(label.id)}
            onMouseLeave={() => onLeave(label.id)}
            className="cursor-default"
          >
            {/* The hole, as a target. A reader aims at the folder, and a line
                of glyphs is a poor thing to hit — the gap the cluster leaves is
                the shape they mean, and nothing else is inside it. */}
            <circle cx={label.x * SIDE} cy={label.y * SIDE} r={hole} fill="transparent" />
            {named && (
              <text
                x={label.x * SIDE}
                y={label.y * SIDE}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={font}
                className="pointer-events-none fill-mist-300 font-semibold select-none"
              >
                {label.text}
              </text>
            )}
          </g>
        );
      })}

      {graph.nodes.map((node) => {
        const radius = radiusOf(node, heaviest, graph.maxRadius);
        const style = getNodeStyle(node, verdicts);

        return (
          <g
            key={node.id}
            onMouseEnter={() => onEnter(node.id)}
            onMouseLeave={() => onLeave(node.id)}
            onClick={() => {
              if (!wasDragged() && node.path) onOpenProject(node.path);
            }}
            onContextMenu={(event) => {
              const project = node.path && projects.find((entry) => entry.path === node.path);
              if (project) onContextMenu(project, event);
            }}
            className={node.kind === "project" ? "cursor-pointer" : "cursor-default"}
          >
            <circle
              cx={node.x * SIDE}
              cy={node.y * SIDE}
              r={radius}
              fill={style.fill}
              stroke={style.stroke}
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
            {nameEverything && (
              <NodeName node={node} radius={radius} scale={labelScale} showWeight={showWeights} />
            )}
          </g>
        );
      })}
    </>
  );
});

/**
 * What the pointer is on, and what that reaches.
 *
 * Drawn over a faded copy of everything else rather than by restyling it. The
 * set is the hovered node and whatever shares an edge with it, which on this
 * map is a handful even when the workspace is not.
 */
function MapHighlight({
  graph,
  byId,
  hovered,
  family,
  heaviest,
  verdicts,
  labelScale,
}: {
  graph: WorkspaceGraph;
  byId: Map<string, GraphNode>;
  hovered: string;
  /** Set when what is under the pointer is a folder rather than a node. */
  family: WorkspaceGraph["labels"][number] | null;
  heaviest: { project: number; package: number };
  verdicts: Record<string, Verdict>;
  labelScale: number;
}) {
  const centre = { x: (graph.width * SIDE) / 2, y: SIDE / 2 };
  // A folder is not a node and has no edges, so asking the edge list about it
  // returns nothing — which faded the whole picture and lit none of it, the
  // folder's own projects included. What a folder reaches is its members.
  const edges = family
    ? []
    : graph.edges.filter((edge) => edge.from === hovered || edge.to === hovered);
  const reached = new Set<string>(
    family ? family.paths.map((path) => `project:${path}`) : [hovered],
  );
  for (const edge of edges) {
    reached.add(edge.from);
    reached.add(edge.to);
  }

  return (
    <g className="pointer-events-none">
      {family && (
        <path
          d={outlinePath(family)}
          className="fill-sage-400/15 stroke-sage-400"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      )}

      {edges.map((edge) => {
        const from = byId.get(edge.from);
        const to = byId.get(edge.to);
        if (!from || !to) return null;
        return (
          <path
            key={edge.id}
            d={edgePath(from, to, centre, edge.kind)}
            fill="none"
            stroke={edge.kind === "clone" ? "var(--color-coral-300)" : "var(--color-pro-200)"}
            strokeWidth={2}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            strokeDasharray={edge.kind === "clone" ? "6 5" : undefined}
          />
        );
      })}

      {[...reached].map((id) => {
        const node = byId.get(id);
        if (!node) return null;
        // Under a folder every member is the subject, so none of them is the
        // one being pointed at.
        const on = !family && id === hovered;
        const base = radiusOf(node, heaviest, graph.maxRadius);
        const radius = on ? base * 1.08 + 2 : base;
        const style = getNodeStyle(node, verdicts);

        return (
          <g key={id}>
            {on && (
              <circle
                cx={node.x * SIDE}
                cy={node.y * SIDE}
                r={radius * 1.55}
                fill={style.stroke}
                opacity={0.14}
              />
            )}
            <circle
              cx={node.x * SIDE}
              cy={node.y * SIDE}
              r={radius}
              fill={style.fill}
              stroke={on ? "var(--color-mist-100)" : style.stroke}
              strokeWidth={on ? 2.5 : 1.5}
              vectorEffect="non-scaling-stroke"
            />
            <NodeName node={node} radius={radius} scale={labelScale} showWeight bold={on || Boolean(family)} />
          </g>
        );
      })}
    </g>
  );
}

/**
 * A name under a node, counter-scaled.
 *
 * A name is a screen thing, not a world thing: left to scale with the picture,
 * zooming in enlarges the names already readable until they collide instead of
 * revealing the ones that were too small.
 */
function NodeName({
  node,
  radius,
  scale,
  showWeight,
  bold = false,
}: {
  node: GraphNode;
  radius: number;
  scale: number;
  showWeight: boolean;
  bold?: boolean;
}) {
  return (
    <g
      transform={`translate(${node.x * SIDE}, ${node.y * SIDE + radius}) scale(${1 / scale})`}
      className="pointer-events-none select-none"
    >
      <text
        y="14"
        textAnchor="middle"
        className={`text-[12px] ${bold ? "fill-mist-100 font-semibold" : "fill-mist-300 font-normal"}`}
      >
        {clip(node.label)}
      </text>
      {showWeight && node.weight !== null && (
        <text y="26" textAnchor="middle" className="fill-mist-500 font-mono text-[9px]">
          {formatBytes(node.bytes)}
        </text>
      )}
    </g>
  );
}

/**
 * A copy line is the faint version of the colour it becomes under the pointer,
 * and of the ring it leaves. It was `forest-800`, which is a border token —
 * something meant to be barely there — and on the light canvas that is 1.2:1
 * whatever opacity it is given. No amount of alpha makes a border into a line
 * you can follow; the token was the wrong one.
 */
const EDGE_STROKE: Record<GraphEdge["kind"], string> = {
  copy: "var(--color-pro-200)",
  clone: "var(--color-coral-300)",
};

/**
 * How present a line is when nothing is asked of it.
 *
 * There are hundreds of `copy` lines and a handful of the others, and drawn
 * alike the many bury the few: close in and the picture is a mesh with the
 * nodes somewhere behind it. They are faint at rest and full strength under the
 * pointer, which is the only time one line is worth following.
 */
const RESTING_EDGE: Record<GraphEdge["kind"], number> = {
  // 2.2:1 against the light canvas and 3.1:1 against the dark one: followable,
  // and well under the contrast the nodes carry, which is what keeps a hundred
  // of them a texture rather than the subject.
  copy: 0.45,
  clone: 0.55,
};

/**
 * A closed curve through the outline points, rounded at every one of them.
 *
 * Each segment is a quadratic from the midpoint of one edge to the midpoint of
 * the next, with the shared corner as its control — the standard way to round a
 * polygon, and the reason a four-member folder reads as a soft shape rather
 * than as a diamond. Two members are a line and not a shape, so they get a
 * circle around their middle instead.
 */
function outlinePath(label: WorkspaceGraph["labels"][number]): string {
  const points = label.outline.map((point) => ({ x: point.x * SIDE, y: point.y * SIDE }));
  if (points.length < 3) {
    const radius = (label.reach + label.outline.length * 0) * SIDE + 26;
    const cx = label.x * SIDE;
    const cy = label.y * SIDE;
    return `M ${cx - radius} ${cy} a ${radius} ${radius} 0 1 0 ${radius * 2} 0 a ${radius} ${radius} 0 1 0 ${-radius * 2} 0`;
  }

  const mid = (one: { x: number; y: number }, two: { x: number; y: number }) => ({
    x: (one.x + two.x) / 2,
    y: (one.y + two.y) / 2,
  });

  const start = mid(points[points.length - 1], points[0]);
  let path = `M ${start.x} ${start.y}`;
  for (let at = 0; at < points.length; at += 1) {
    const corner = points[at];
    const next = mid(corner, points[(at + 1) % points.length]);
    path += ` Q ${corner.x} ${corner.y} ${next.x} ${next.y}`;
  }
  return `${path} Z`;
}

/**
 * A line, bent toward the middle.
 *
 * Straight chords from a dozen packages to a hundred projects cross everything
 * on the way and read as static. Bending each one inward makes the lines
 * leaving a package fan and run together — the same trick as bundling, at the
 * cost of one control point — so a package reads as a hub rather than as the
 * place a lot of lines happen to meet.
 *
 * A family's own lines are short and inside a cluster; bending those toward a
 * centre a long way off would swing them out of it.
 */
function edgePath(
  from: GraphNode,
  to: GraphNode,
  centre: { x: number; y: number },
  kind: GraphEdge["kind"],
): string {
  const x1 = from.x * SIDE;
  const y1 = from.y * SIDE;
  const x2 = to.x * SIDE;
  const y2 = to.y * SIDE;
  const bend = kind === "copy" ? 0.26 : 0.14;
  const mid = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
  const cx = mid.x + (centre.x - mid.x) * bend;
  const cy = mid.y + (centre.y - mid.y) * bend;
  return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
}

function radiusOf(
  node: GraphNode,
  heaviest: { project: number; package: number },
  ceiling: number,
): number {
  return (
    nodeRadius(node.weight, node.kind === "project" ? heaviest.project : heaviest.package, ceiling) *
    SIDE
  );
}
