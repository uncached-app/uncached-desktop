import { FolderSearch, TriangleAlert } from "lucide-react";

/**
 * What the workspace shows when there is no map to show.
 *
 * The projects screen is reached by finishing a scan, and the two readings of
 * that scan finish independently: the artifacts can be on screen while the
 * projects are still being discovered, or after discovery failed outright. Both
 * are states this screen has to be able to be in, because the alternative — the
 * screen the user was sent to rendering nothing — reads as a broken app.
 */
export function WorkspaceUnavailable({
  error,
  onRetry,
  onChooseFolders,
}: {
  /** Absent while discovery is still running. */
  error: string | null;
  onRetry: () => void;
  onChooseFolders: () => void;
}) {
  return (
    <section
      aria-label="Workspace"
      className="flex h-full w-full flex-1 items-center justify-center px-6"
    >
      <div className="w-full max-w-md rounded-2xl border border-forest-800 bg-forest-900 px-6 py-12 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-2xl border border-forest-800 bg-forest-950 text-mist-500">
          {error ? (
            <TriangleAlert size={22} strokeWidth={1.5} aria-hidden="true" />
          ) : (
            <FolderSearch size={22} strokeWidth={1.5} aria-hidden="true" />
          )}
        </div>

        <h2 className="mt-4 text-sm font-semibold text-mist-100">
          {error ? "Your folders could not be read" : "Reading your folders"}
        </h2>

        {error ? (
          <>
            <p className="mx-auto mt-1.5 max-w-sm font-mono text-[11px] leading-5 break-words text-mist-500">
              {error}
            </p>
            <p className="mx-auto mt-3 max-w-sm text-xs leading-5 text-mist-500">
              A folder the system refuses to open cannot be indexed. Granting the app access to the
              disk, or choosing a folder inside it, is what makes it readable.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={onRetry}
                className="rounded-xl border border-forest-800 bg-forest-950 px-3 py-2 text-xs font-medium text-mist-100 transition-colors hover:bg-forest-850"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={onChooseFolders}
                className="rounded-xl px-3 py-2 text-xs font-medium text-mist-500 transition-colors hover:text-mist-100"
              >
                Choose other folders
              </button>
            </div>
          </>
        ) : (
          <p className="mx-auto mt-1.5 max-w-sm text-xs leading-5 text-mist-500">
            Projects are being discovered. The artifacts this scan found are already on the
            reclaim screen.
          </p>
        )}
      </div>
    </section>
  );
}
