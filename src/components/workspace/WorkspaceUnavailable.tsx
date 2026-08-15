import { Loader2, TriangleAlert } from "lucide-react";

/**
 * What the workspace shows when discovery is running or failed.
 *
 * Minimalist, unboxed loading spinner while discovering, and clean error card if failed.
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
      {error ? (
        <div className="w-full max-w-md rounded-2xl border border-forest-800 bg-forest-900 px-6 py-8 text-center shadow-sm">
          <div className="mx-auto grid size-12 place-items-center rounded-2xl border border-coral-300/30 bg-coral-300/10 text-coral-300">
            <TriangleAlert size={22} strokeWidth={1.5} aria-hidden="true" />
          </div>

          <h2 className="mt-4 text-sm font-semibold text-mist-100">
            Your folders could not be read
          </h2>

          <p className="mx-auto mt-1.5 max-w-sm font-mono text-[11px] leading-5 break-words text-coral-300">
            {error}
          </p>
          <p className="mx-auto mt-2.5 max-w-sm text-xs leading-5 text-mist-500">
            A folder the system refuses to open cannot be indexed. Granting the app access to the
            disk, or choosing a folder inside it, is what makes it readable.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={onRetry}
              className="rounded-xl bg-sage-400 px-3.5 py-2 text-xs font-semibold text-forest-950 shadow-xs transition-all hover:bg-sage-300 active:scale-[0.98] cursor-pointer"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={onChooseFolders}
              className="rounded-xl border border-forest-800 bg-forest-850 px-3.5 py-2 text-xs font-medium text-mist-300 transition-all hover:bg-forest-800 hover:text-mist-100 cursor-pointer"
            >
              Choose other folders
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 text-center select-none">
          <div className="relative grid size-10 place-items-center">
            <Loader2 size={26} className="animate-spin text-sage-400" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-mist-100">Reading your folders</p>
            <p className="max-w-xs text-xs text-mist-500">
              Discovering projects and analyzing workspace structure...
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
