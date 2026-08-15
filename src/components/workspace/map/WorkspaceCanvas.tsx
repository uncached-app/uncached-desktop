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
        fill: "var(--color-forest-900)",
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
      return {
        fill: "var(--color-forest-900)",
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
  const activeProject = active?.path ? projects.find((entry) => entry.path === active.path) : null;
  const activeFootprint = activeProject ? footprints[activeProject.path] : null;

  const nameEverything = graph.nodes.length <= 34 || map.view.scale > 1.4;
  // Quantised, so a continuous zoom redraws the body twenty times over its
  // range rather than on every frame of it. Names end up within five percent
  // of their intended size, which is not a difference anyone can see.
  const labelScale = Math.max(0.1, Math.round(map.view.scale * 10) / 10);

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

  // The tooltip appears where the pointer already is, which nothing would know
  // if its position had stopped being state and gone nowhere else.
  useLayoutEffect(placeTooltip, [placeTooltip, hovered]);

  // Stable, so the memoised body is not rebuilt by a new function each render.
  const onEnter = useCallback((id: string) => setHovered(id), []);
  const onLeave = useCallback(
    (id: string) => setHovered((current) => (current === id ? null : current)),
    [],
  );

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-forest-800 bg-forest-950 select-none"
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
              showWeights={map.view.scale > 1.6}
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
              heaviest={heaviest}
              verdicts={verdicts}
              labelScale={labelScale}
            />
          )}
        </g>
      </svg>

      {/* Modern, Minimalist Floating Tooltip on Hover */}
      {active && !map.dragging && (
        <div
          ref={tooltipRef}
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
            <span className="truncate text-mist-500">{legend(graph)}</span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3 text-mist-500 text-[11px]">
          {measuring && <span className="text-sage-300 font-mono">Weighing...</span>}
          {analysing && <span className="text-mist-400 font-mono">Reading packages...</span>}
          {graph.packagesOmitted > 0 && <span>{graph.packagesOmitted} lighter packages omitted</span>}
        </div>
      </div>
    </div>
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

/**
 * The shape of the drawing area, so the picture fills it.
 */
export function useDrawingAspect() {
  const ref = useRef<HTMLDivElement>(null);
  const [aspect, setAspect] = useState(1.6);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      if (width > 0 && height > 0) {
        const next = Math.round((width / height) * 20) / 20;
        setAspect((current) => (Math.abs(current - next) >= 0.05 ? next : current));
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, aspect };
}

/**
 * Whether a family's name fits inside the ring of its own members.
 *
 * The name sits at the cluster's centre and is counter-scaled, so zooming out
 * grows it relative to the cluster until it covers the projects it is naming.
 * Below the fit it is not drawn: the shape is still there, and closing in is
 * what asks for the name — the same bargain every other label on this map
 * makes.
 */
function nameFits(label: WorkspaceGraph["labels"][number], scale: number, node: number): boolean {
  // `reach` is to the members' centres, so their own radius comes off it: the
  // hole is what is left between them, not the circle they sit on.
  return (label.reach * SIDE - node) * scale > 82;
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

function legend(graph: WorkspaceGraph): string {
  const parts = [];
  if (!graph.sharesNothing) parts.push("a ring is a package more than one project keeps its own copy of");
  if (graph.labels.length > 0) parts.push("a green chain is one directory holding several");
  if (graph.edges.some((edge) => edge.kind === "clone")) parts.push("a dashed line is one repository checked out twice");

  if (parts.length === 0) {
    return "Nothing here is shared. Drag to move, scroll to zoom.";
  }
  return `${parts.join(" · ")}. Drag to move, scroll to zoom.`;
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

  return (
    <>
      {graph.edges.map((edge) => {
        const from = byId.get(edge.from);
        const to = byId.get(edge.to);
        if (!from || !to) return null;

        return (
          <line
            key={edge.id}
            x1={from.x * SIDE}
            y1={from.y * SIDE}
            x2={to.x * SIDE}
            y2={to.y * SIDE}
            stroke={EDGE_STROKE[edge.kind]}
            strokeWidth={edge.kind === "family" ? 1.75 : edge.kind === "clone" ? 1.5 : 1.25}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            strokeDasharray={edge.kind === "clone" ? "6 5" : undefined}
            opacity={edge.kind === "family" ? 0.6 : 1}
          />
        );
      })}

      {graph.labels.map(
        (label) =>
          nameFits(label, labelScale, graph.maxRadius * SIDE) && (
            <g
              key={label.id}
              transform={`translate(${label.x * SIDE}, ${label.y * SIDE}) scale(${1 / labelScale})`}
              className="pointer-events-none select-none"
            >
              <rect
                x="-75"
                y="-18"
                width="150"
                height="36"
                rx="10"
                className="fill-forest-900 stroke-forest-800"
                strokeWidth="1"
              />
              <text x="0" y="-1" textAnchor="middle" className="fill-mist-100 text-[12px] font-semibold">
                {label.text}
              </text>
              <text x="0" y="11" textAnchor="middle" className="fill-mist-500 font-mono text-[9px]">
                {label.detail}
              </text>
            </g>
          ),
      )}

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
  heaviest,
  verdicts,
  labelScale,
}: {
  graph: WorkspaceGraph;
  byId: Map<string, GraphNode>;
  hovered: string;
  heaviest: { project: number; package: number };
  verdicts: Record<string, Verdict>;
  labelScale: number;
}) {
  const edges = graph.edges.filter((edge) => edge.from === hovered || edge.to === hovered);
  const reached = new Set<string>([hovered]);
  for (const edge of edges) {
    reached.add(edge.from);
    reached.add(edge.to);
  }

  return (
    <g className="pointer-events-none">
      {edges.map((edge) => {
        const from = byId.get(edge.from);
        const to = byId.get(edge.to);
        if (!from || !to) return null;
        return (
          <line
            key={edge.id}
            x1={from.x * SIDE}
            y1={from.y * SIDE}
            x2={to.x * SIDE}
            y2={to.y * SIDE}
            stroke={edge.kind === "clone" ? "var(--color-coral-300)" : edge.kind === "family" ? "var(--color-sage-400)" : "var(--color-pro-200)"}
            strokeWidth={edge.kind === "family" ? 2.5 : edge.kind === "clone" ? 2.25 : 2}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            strokeDasharray={edge.kind === "clone" ? "6 5" : undefined}
          />
        );
      })}

      {[...reached].map((id) => {
        const node = byId.get(id);
        if (!node) return null;
        const on = id === hovered;
        const base = radiusOf(node, heaviest, graph.maxRadius);
        const radius = on ? base * 1.08 + 2 : base;
        const style = getNodeStyle(node, verdicts);

        return (
          <g key={id}>
            {on && (
              <circle
                cx={node.x * SIDE}
                cy={node.y * SIDE}
                r={radius + 4.5}
                fill="none"
                stroke="var(--color-mist-300)"
                strokeWidth="1"
                strokeDasharray="3 3"
                vectorEffect="non-scaling-stroke"
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
            <NodeName node={node} radius={radius} scale={labelScale} showWeight bold={on} />
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

const EDGE_STROKE: Record<GraphEdge["kind"], string> = {
  copy: "var(--color-forest-800)",
  clone: "var(--color-coral-300)",
  family: "var(--color-sage-400)",
};

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
