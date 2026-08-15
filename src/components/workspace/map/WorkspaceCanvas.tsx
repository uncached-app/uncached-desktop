import { Maximize2, Minus, Plus } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useMapGestures } from "./useMapGestures";
import { nodeRadius, type GraphEdge, type GraphNode, type WorkspaceGraph } from "../../../utils/graph.mjs";
import { formatBytes } from "../../../utils/format.mjs";
import { VERDICT_PRESENTATION } from "../verdictPresentation";
import type { WorkspaceProject } from "../../../types/workspace";

/** Height of the drawing, in the coordinates the SVG uses. Width follows it. */
const SIDE = 1000;

type WorkspaceCanvasProps = {
  /** Built by the caller, which is also what decides this can be drawn at all. */
  graph: WorkspaceGraph;
  projects: WorkspaceProject[];
  /** The duplicate reading has not finished, so the middle is not final. */
  analysing: boolean;
  measuring: boolean;
  onOpenProject: (path: string) => void;
  onContextMenu: (project: WorkspaceProject, event: React.MouseEvent) => void;
};

const EDGE_CLASS: Record<GraphEdge["kind"], string> = {
  copy: "stroke-forest-800",
  clone: "stroke-coral-300/45",
  family: "stroke-sage-400/50",
};

/**
 * The workspace as one picture.
 *
 * The list answers "what do I have and what is it worth". This answers what a
 * list cannot hold: what is shared. A package sitting in eleven projects is a
 * node of its own with a line to each of them; four folders under one directory
 * are a chain with that directory's name on it; one repository checked out
 * twice is a dashed chord. Without those, a graph of a workspace is folders
 * joined by folders, which is what the sidebar already draws.
 *
 * The list stays the default and stays the way through by keyboard. This is the
 * other reading, not the replacement.
 */
export function WorkspaceCanvas({
  graph,
  projects,
  analysing,
  measuring,
  onOpenProject,
  onContextMenu,
}: WorkspaceCanvasProps) {
  const [hovered, setHovered] = useState<string | null>(null);

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
  // A line lights with either end. Hovering a package is the gesture that asks
  // "who else has this", so the answer has to light up with it.
  const isLit = (edge: GraphEdge) => edge.from === hovered || edge.to === hovered;
  // Enough room to name everything, or only what is pointed at: a map printing
  // sixty overlapping names is a map nobody reads one of.
  // Enough room to name everything, or only what is pointed at — and zooming in
  // is the request for more of them, which is what makes closing in on a corner
  // worth doing rather than just larger.
  const nameEverything = graph.nodes.length <= 34 || map.view.scale > 1.5;

  return (
    <div className="relative flex h-full min-h-0 flex-col">
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
        {graph.edges.map((edge) => {
          const from = byId.get(edge.from);
          const to = byId.get(edge.to);
          if (!from || !to) return null;
          const on = isLit(edge);
          return (
            <line
              key={edge.id}
              x1={from.x * SIDE}
              y1={from.y * SIDE}
              x2={to.x * SIDE}
              y2={to.y * SIDE}
              className={on ? "stroke-sage-400" : EDGE_CLASS[edge.kind]}
              strokeWidth={edge.kind === "family" ? 3 : on ? 2 : 1.25}
              strokeLinecap="round"
              // A line drawn four times its width because the picture is four
              // times closer is a smear, not more information.
              vectorEffect="non-scaling-stroke"
              strokeDasharray={edge.kind === "clone" ? "7 6" : undefined}
            />
          );
        })}

        {/* The directory's name, once, in the middle of what it holds. Four
            folders under one `uncached-app` are one piece of work, and drawing
            them as four unrelated dots is what needed fixing here. */}
        {graph.labels.map((label) => (
          <text
            key={label.id}
            x={label.x * SIDE}
            y={label.y * SIDE}
            textAnchor="middle"
            className="pointer-events-none fill-mist-300 text-[15px] font-semibold"
          >
            {label.text}
            <tspan x={label.x * SIDE} dy="15" className="fill-mist-500 text-[11px] font-normal">
              {label.detail}
            </tspan>
          </text>
        ))}

        {graph.nodes.map((node) => {
          const radius =
            nodeRadius(
              node.weight,
              node.kind === "project" ? heaviest.project : heaviest.package,
              graph.maxRadius,
            ) * SIDE;
          const on = node.id === hovered;
          return (
            <g
              key={node.id}
              onMouseEnter={() => setHovered(node.id)}
              onMouseLeave={() => setHovered((current) => (current === node.id ? null : current))}
              // A drag that ended on a node is a drag. Opening the project
              // there would make the map impossible to move from anywhere
              // except the gaps between things.
              onClick={() => {
                if (!map.wasDragged() && node.path) onOpenProject(node.path);
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
                className={
                  node.kind === "package"
                    ? "fill-forest-900 stroke-sage-400"
                    : `${VERDICT_PRESENTATION[node.verdict ?? "unknown"].mapClassName} ${
                        node.weight === null ? "opacity-45" : ""
                      }`
                }
                strokeWidth={on ? 3 : 1.75}
                vectorEffect="non-scaling-stroke"
              />
              {(nameEverything || on) && (
                <text
                  x={node.x * SIDE}
                  y={node.y * SIDE + radius + 17}
                  textAnchor="middle"
                  className={`pointer-events-none text-[13px] ${on ? "fill-mist-100 font-medium" : "fill-mist-500"}`}
                >
                  {clip(node.label)}
                </text>
              )}
            </g>
          );
        })}
        </g>
      </svg>

      <MapControls map={map} />

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-5 gap-y-2 border-t border-forest-800 pt-3 text-xs">
        <div className="flex min-h-5 min-w-0 items-center gap-2">
          {active ? (
            <>
              <span className="truncate font-medium text-mist-100">{active.label}</span>
              <span className="shrink-0 font-mono text-[11px] text-mist-500">
                {active.kind === "package"
                  ? `${active.detail} · ${formatBytes(active.bytes)} duplicated`
                  : active.weight === null
                    ? "not measured yet"
                    : formatBytes(active.bytes)}
              </span>
            </>
          ) : (
            // Names what is on screen, not what the picture can hold: a legend
            // describing rings and dashes that are not there reads as a view
            // that failed to load.
            <span className="truncate text-mist-500">{legend(graph)}</span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-4 text-mist-500">
          {measuring && <span>Weighing projects...</span>}
          {analysing && <span>Reading shared packages...</span>}
          {graph.packagesOmitted > 0 && <span>{graph.packagesOmitted} lighter packages not drawn</span>}
        </div>
      </div>
    </div>
  );
}

/**
 * Zoom in, out, and back to the whole thing.
 *
 * The gestures are the ones the platform already teaches — drag to move, pinch
 * or wheel to zoom — and buttons exist because a gesture nobody is told about
 * is a feature nobody finds. Reset appears only once there is something to
 * reset, so the corner is empty on a map nobody has touched.
 */
function MapControls({ map }: { map: ReturnType<typeof useMapGestures> }) {
  const step = (factor: number) => () => {
    const element = map.ref.current;
    if (!element) return;
    const bounds = element.getBoundingClientRect();
    // From the middle, because a button press has no pointer over the picture
    // to hold still.
    map.zoomBy(factor, { clientX: bounds.left + bounds.width / 2, clientY: bounds.top + bounds.height / 2 });
  };

  return (
    <div className="absolute right-3 top-3 flex flex-col gap-1 rounded-xl border border-forest-800 bg-forest-900/90 p-1 shadow-xs backdrop-blur-sm">
      <Control label="Zoom in" onClick={step(1.35)}>
        <Plus size={14} aria-hidden="true" />
      </Control>
      <Control label="Zoom out" onClick={step(1 / 1.35)}>
        <Minus size={14} aria-hidden="true" />
      </Control>
      {map.moved && (
        <Control label="Fit the whole workspace" onClick={map.reset}>
          <Maximize2 size={13} aria-hidden="true" />
        </Control>
      )}
    </div>
  );
}

function Control({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="grid size-7 place-items-center rounded-lg text-mist-500 transition-colors hover:bg-forest-850 hover:text-mist-100"
    >
      {children}
    </button>
  );
}

/**
 * The shape of the drawing area, so the picture fills it.
 *
 * A layout computed square and centred in a wide window is a square of content
 * with an empty column either side of it, which is what this looked like first.
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
    return "Nothing here is shared: no package sits in more than one of these projects, and no two are the same repository. Drag to move, scroll to zoom.";
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
