import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";

type SearchPanelProps = {
  title: string;
  subtitle: string;
  /** The picker and its action button. */
  children: ReactNode;
  /** Shown under the actions, for plan notes and the like. */
  note?: ReactNode;
  error?: string | null;
};

/**
 * The opening screen of a module that starts by choosing folders.
 *
 * Height and top offset are fixed here so every module's search block begins
 * at the same place and switching between them moves nothing. `min-h` rather
 * than `h`: a long list of pills has to push the panel down rather than be
 * clipped out of sight.
 */
export function SearchPanel({ title, subtitle, children, note, error }: SearchPanelProps) {
  return (
    <div className="flex min-h-96 w-full flex-col items-center pt-16 text-center">
      <div className="flex w-full max-w-2xl flex-col items-center">
        <h1 className="text-4xl font-semibold leading-[1.05] tracking-tighter text-mist-100 sm:text-5xl">{title}</h1>
        <p className="mt-3 max-w-xl text-base leading-relaxed text-mist-500">{subtitle}</p>

        <div className="mt-8 w-full">{children}</div>

        {note && <div className="mt-5 text-xs leading-5 text-mist-500">{note}</div>}
        {error && (
          <p className="mt-4 flex items-center gap-2 text-sm text-coral-300">
            <CircleAlert size={15} aria-hidden="true" />
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
