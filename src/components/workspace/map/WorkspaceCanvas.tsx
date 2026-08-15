import { useMemo, useState } from "react";
import {
  nodeRadius,
  packageRadiusCeiling,
  projectRadiusCeiling,
  type GraphNode,
  type WorkspaceGraph,
} from "../../../utils/graph.mjs";
import { formatBytes } from "../../../utils/format.mjs";
import { VERDICT_PRESENTATION } from "../verdictPresentation";
import type { WorkspaceProject } from "../../../types/workspace";

/** The unit square, in the coordinates the SVG is drawn in. */
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

/**
 * The workspace as one picture.
 *
 * The list answers "what do I have and what is it worth". This answers the
 * question a list cannot hold: what is shared. A shared package is a node of
 * its own, sitting in the middle with a line to every project carrying a copy
 * of it, because "eleven projects each keep their own React" is a shape and not
 * a row. Without those nodes a graph of a workspace is folders joined by
 * folders, which is what the sidebar already draws.
 *
 * The list stays the default and stays the way through by keyboard. This is the
 * other reading, not the replacement: a graph cannot be tabbed through, and a
 * workspace of two hundred projects is a hairball however it is laid out — past
 * that size the caller draws the list instead, which is why nothing here has to
 * handle a picture it cannot make.
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

  // Both rings give up size as they fill: an arc that has to hold eighty nodes
  // cannot also hold eighty large ones.
  const packageCount = graph.nodes.length - projects.length;
  const ceiling = {
    project: projectRadiusCeiling(projects.length),
    package: packageRadiusCeiling(packageCount),
  };
  const active = hovered ? byId.get(hovered) : null;
  // A line is lit when either end is. Hovering a package is the gesture that
  // answers "who else has this", so the answer has to light up with it.
  const lit = (id: string) => hovered !== null && id === hovered;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <svg
        viewBox={`0 0 ${SIDE} ${SIDE}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`${projects.length} projects and ${graph.nodes.length - projects.length} shared packages. The list beside this reads the same workspace.`}
        className="min-h-0 w-full flex-1"
      >
        {graph.edges.map((edge) => {
          const from = byId.get(edge.from);
          const to = byId.get(edge.to);
          if (!from || !to) return null;
          const on = lit(edge.from) || lit(edge.to);
          return (
            <line
              key={edge.id}
              x1={from.x * SIDE}
              y1={from.y * SIDE}
              x2={to.x * SIDE}
              y2={to.y * SIDE}
              className={
                edge.kind === "clone"
                  ? "stroke-coral-300/50"
                  : on
                    ? "stroke-sage-400/70"
                    : "stroke-forest-800"
              }
              strokeWidth={on ? 2 : 1}
              strokeDasharray={edge.kind === "clone" ? "6 5" : undefined}
            />
          );
        })}

        {graph.nodes.map((node) => {
          const radius =
            (node.kind === "project"
              ? nodeRadius(node.weight, heaviest.project, {
                  max: ceiling.project,
                  min: Math.min(0.012, ceiling.project),
                })
              : nodeRadius(node.weight, heaviest.package, {
                  max: ceiling.package,
                  min: Math.min(0.012, ceiling.package),
                })) * SIDE;
          const on = lit(node.id);
          return (
            <g
              key={node.id}
              onMouseEnter={() => setHovered(node.id)}
              onMouseLeave={() => setHovered((current) => (current === node.id ? null : current))}
              onClick={() => node.path && onOpenProject(node.path)}
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
                    : `${VERDICT_PRESENTATION[node.verdict ?? "unknown"].fillClassName} ${
                        node.weight === null ? "opacity-30" : "opacity-80"
                      }`
                }
                strokeWidth={node.kind === "package" ? 2 : 0}
              />
              {/* Only what can be read at this size. Everything else is one
                  hover away, and a map printing 60 overlapping names is a map
                  nobody reads a single one of. */}
              {(node.kind === "package" || on || radius > 22) && (
                <text
                  x={node.x * SIDE}
                  y={node.y * SIDE + radius + 15}
                  textAnchor="middle"
                  className={`pointer-events-none text-[13px] ${on ? "fill-mist-100" : "fill-mist-500"}`}
                >
                  {node.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>

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
            <span className="text-mist-500">
              A ring is a shared package. A line is a project holding a copy of it.
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-4 text-mist-500">
          {measuring && <span>Weighing projects...</span>}
          {analysing && <span>Reading shared packages...</span>}
          {graph.packagesOmitted > 0 && (
            <span>{graph.packagesOmitted} lighter packages not drawn</span>
          )}
        </div>
      </div>
    </div>
  );
}

function max(nodes: GraphNode[], kind: GraphNode["kind"]): number {
  return nodes.reduce((top, node) => (node.kind === kind ? Math.max(top, node.weight ?? 0) : top), 0);
}
