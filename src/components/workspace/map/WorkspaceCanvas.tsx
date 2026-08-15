import { Maximize2, Minus, Plus } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
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
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const byId = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph.nodes]);
  const heaviest = useMemo(
    () => ({
      project: max(graph.nodes, "project"),
      package: max(graph.nodes, "package"),
    }),
    [graph.nodes],
  );

  const map = useMapGestures(graph.width * SIDE, SIDE);
  const active = hovered ? byId.get(hovered) : null;
  const activeProject = active?.path ? projects.find((entry) => entry.path === active.path) : null;
  const activeFootprint = activeProject ? footprints[activeProject.path] : null;

  // Connected nodes and edges highlighting
  const connectedNodeIds = useMemo(() => {
    if (!hovered) return null;
    const ids = new Set<string>([hovered]);
    for (const edge of graph.edges) {
      if (edge.from === hovered) ids.add(edge.to);
      if (edge.to === hovered) ids.add(edge.from);
    }
    return ids;
  }, [hovered, graph.edges]);

  const isLit = (edge: GraphEdge) => edge.from === hovered || edge.to === hovered;
  const nameEverything = graph.nodes.length <= 34 || map.view.scale > 1.4;

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      setMousePos({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    }
  };

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
        <g transform={`translate(${map.view.x} ${map.view.y}) scale(${map.view.scale})`}>
          {/* Relationship Lines / Edges */}
          {graph.edges.map((edge) => {
            const from = byId.get(edge.from);
            const to = byId.get(edge.to);
            if (!from || !to) return null;

            const on = isLit(edge);
            const dimmed = connectedNodeIds !== null && !on;

            let stroke = "var(--color-forest-800)";
            let strokeWidth = 1.25;

            if (edge.kind === "family") {
              stroke = on ? "var(--color-sage-400)" : "var(--color-sage-400)";
              strokeWidth = on ? 2.5 : 1.75;
            } else if (edge.kind === "clone") {
              stroke = "var(--color-coral-300)";
              strokeWidth = on ? 2.25 : 1.5;
            } else if (edge.kind === "copy") {
              stroke = on ? "var(--color-pro-200)" : "var(--color-forest-800)";
              strokeWidth = on ? 2 : 1.25;
            }

            return (
              <line
                key={edge.id}
                x1={from.x * SIDE}
                y1={from.y * SIDE}
                x2={to.x * SIDE}
                y2={to.y * SIDE}
                stroke={stroke}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                strokeDasharray={edge.kind === "clone" ? "6 5" : undefined}
                className="transition-opacity duration-150"
                style={{ opacity: dimmed ? 0.2 : edge.kind === "family" && !on ? 0.6 : 1 }}
              />
            );
          })}

          {/* Directory & Monorepo Hub Badges */}
          {graph.labels.map((label) => (
            <g
              key={label.id}
              transform={`translate(${label.x * SIDE}, ${label.y * SIDE})`}
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
              <text
                x="0"
                y="-1"
                textAnchor="middle"
                className="fill-mist-100 text-[12px] font-semibold"
              >
                {label.text}
              </text>
              <text
                x="0"
                y="11"
                textAnchor="middle"
                className="fill-mist-500 font-mono text-[9px]"
              >
                {label.detail}
              </text>
            </g>
          ))}

          {/* Nodes (Projects & Shared Packages) */}
          {graph.nodes.map((node) => {
            const baseRadius =
              nodeRadius(
                node.weight,
                node.kind === "project" ? heaviest.project : heaviest.package,
                graph.maxRadius,
              ) * SIDE;

            const on = node.id === hovered;
            const isConnected = connectedNodeIds ? connectedNodeIds.has(node.id) : true;
            const dimmed = connectedNodeIds !== null && !isConnected;
            const radius = on ? baseRadius * 1.08 + 2 : baseRadius;
            const style = getNodeStyle(node, verdicts);

            return (
              <g
                key={node.id}
                onMouseEnter={() => setHovered(node.id)}
                onMouseLeave={() => setHovered((current) => (current === node.id ? null : current))}
                onClick={() => {
                  if (!map.wasDragged() && node.path) onOpenProject(node.path);
                }}
                onContextMenu={(event) => {
                  const project = node.path && projects.find((entry) => entry.path === node.path);
                  if (project) onContextMenu(project, event);
                }}
                className={`transition-opacity duration-150 ${
                  node.kind === "project" ? "cursor-pointer" : "cursor-default"
                }`}
                style={{ opacity: dimmed ? 0.25 : 1 }}
              >
                {/* Subtle outer focus ring on hover */}
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

                {/* Minimalist Solid Node Circle */}
                <circle
                  cx={node.x * SIDE}
                  cy={node.y * SIDE}
                  r={radius}
                  fill={style.fill}
                  stroke={on ? "var(--color-mist-100)" : style.stroke}
                  strokeWidth={on ? 2.5 : 1.5}
                  vectorEffect="non-scaling-stroke"
                  className="transition-all duration-150"
                />

                {/* Clean label below node */}
                {(nameEverything || on || isConnected) && (
                  <g
                    transform={`translate(${node.x * SIDE}, ${node.y * SIDE + radius + 14})`}
                    className="pointer-events-none select-none"
                  >
                    <text
                      textAnchor="middle"
                      className={`text-[12px] ${
                        on ? "fill-mist-100 font-semibold" : "fill-mist-300 font-normal"
                      }`}
                    >
                      {clip(node.label)}
                    </text>
                    {(on || map.view.scale > 1.6) && node.weight !== null && (
                      <text
                        y="12"
                        textAnchor="middle"
                        className="fill-mist-500 font-mono text-[9px]"
                      >
                        {formatBytes(node.bytes)}
                      </text>
                    )}
                  </g>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Modern, Minimalist Floating Tooltip on Hover */}
      {active && mousePos && !map.dragging && (
        <div
          className="pointer-events-none absolute z-30 flex flex-col gap-2 rounded-xl border border-forest-800 bg-forest-900 px-3.5 py-2.5 shadow-lg text-xs transition-all duration-75 ease-out"
          style={{
            left: Math.min(
              Math.max(12, mousePos.x + 14),
              (containerRef.current?.clientWidth ?? 800) - 230,
            ),
            top: Math.min(
              Math.max(12, mousePos.y - 60),
              (containerRef.current?.clientHeight ?? 600) - 120,
            ),
          }}
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

      {/* Bottom Status & Summary Bar */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-forest-800 bg-forest-950 px-3.5 py-2 text-xs">
        <div className="flex min-h-6 min-w-0 items-center gap-2">
          {active ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-mist-100">{active.label}</span>

              {active.kind === "package" ? (
                <span className="rounded-md bg-forest-850 px-1.5 py-0.5 font-mono text-[10px] font-medium text-pro-100">
                  {active.detail} · {formatBytes(active.bytes)} shared
                </span>
              ) : (
                <>
                  {activeProject && (
                    <span
                      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.2 font-mono text-[10px] font-medium ${
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

                  <span className="font-mono text-[11px] text-mist-300">
                    {active.weight === null ? "measuring..." : formatBytes(active.bytes)}
                  </span>

                  {activeFootprint && activeFootprint.reclaimableBytes > 0 && (
                    <span className="rounded-md bg-forest-900 border border-forest-800 px-1.5 py-0.2 font-mono text-[10px] font-medium text-sage-300">
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

      {map.moved && (
        <>
          <div className="h-3.5 w-px bg-forest-800 mx-0.5" />
          <Control label="Fit whole workspace" onClick={map.reset}>
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
      if (width > 0 && height > 0) setAspect(width / height);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, aspect };
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
