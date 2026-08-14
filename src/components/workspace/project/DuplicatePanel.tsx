import { ArrowRight, Copy, Folder } from "lucide-react";
import { Panel } from "./panels";

/**
 * The same repository, checked out more than once.
 *
 * Something no file manager can report, because the answer is not on disk — it
 * is in what the repositories claim to be. Each path is a way into that copy's
 * own page, since the decision is usually about which one to keep.
 */
export function DuplicatePanel({ paths, onOpen }: { paths: string[]; onOpen: (path: string) => void }) {
  return (
    <Panel
      title="Duplicate Checkouts"
      action={
        <span className="inline-flex items-center gap-1 rounded-md bg-forest-850 px-2 py-0.5 font-mono text-[10px] font-medium text-mist-300">
          <Copy size={10} aria-hidden="true" />
          {paths.length} {paths.length === 1 ? "copy" : "copies"}
        </span>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-mist-500">
          The same repository is cloned in multiple directories. Each checkout carries its own build
          artifacts and can be cleaned independently.
        </p>

        <ul className="grid gap-2">
          {paths.map((path) => (
            <li key={path}>
              <button
                type="button"
                onClick={() => onOpen(path)}
                className="group flex w-full items-center justify-between gap-3 rounded-xl border border-forest-800 bg-forest-950 px-3.5 py-2.5 text-left transition-all hover:border-sage-400/60 hover:bg-forest-850"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <Folder size={14} className="shrink-0 text-mist-500 group-hover:text-sage-300" aria-hidden="true" />
                  <span className="truncate font-mono text-xs text-mist-300 group-hover:text-mist-100">{path}</span>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-sage-300 opacity-0 transition-opacity group-hover:opacity-100">
                  <span>View project</span>
                  <ArrowRight size={12} aria-hidden="true" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}
