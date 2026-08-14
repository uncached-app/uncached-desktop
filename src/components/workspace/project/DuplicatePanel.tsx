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
    <Panel title="Also on this machine">
      <ul className="grid gap-1.5">
        {paths.map((path) => (
          <li key={path}>
            <button
              type="button"
              onClick={() => onOpen(path)}
              className="w-full truncate rounded-lg px-2 py-1.5 text-left font-mono text-[11px] text-mist-300 transition-colors hover:bg-forest-850 hover:text-mist-100"
            >
              {path}
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-mist-500">
        The same repository, checked out more than once. Every copy carries its own artifacts.
      </p>
    </Panel>
  );
}
