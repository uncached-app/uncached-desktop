import { FolderSearch, Gauge, LockKeyhole, Sparkles, TriangleAlert } from "lucide-react";
import { openExternalUrl } from "../../utils/externalLink";

function Panel({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-forest-800 bg-forest-900 px-6 py-14 text-center">
      <div className="mx-auto grid size-12 place-items-center rounded-2xl border border-forest-800 bg-forest-950 text-mist-500">
        {icon}
      </div>
      <h3 className="mt-4 text-sm font-semibold text-mist-100">{title}</h3>
      <div className="mx-auto mt-1.5 max-w-sm text-xs leading-5 text-mist-500">{children}</div>
    </div>
  );
}

/** Nothing to read yet, and the reason is one the user can act on. */
export function NoFoldersChosen({ onChoose }: { onChoose: () => void }) {
  return (
    <Panel icon={<FolderSearch size={22} strokeWidth={1.5} aria-hidden="true" />} title="No folders chosen yet">
      <p>A policy is applied to the projects in the folders you scan. There are none yet.</p>
      <button
        type="button"
        onClick={onChoose}
        className="mt-4 rounded-xl border border-forest-800 bg-forest-950 px-3 py-2 text-xs font-medium text-mist-100 transition-colors hover:bg-forest-850"
      >
        Choose a folder
      </button>
    </Panel>
  );
}

export function ReadingFolders() {
  return (
    <Panel icon={<FolderSearch size={22} strokeWidth={1.5} aria-hidden="true" />} title="Reading your folders">
      <p>Projects are being discovered.</p>
    </Panel>
  );
}

/**
 * Named rather than counted as a selection of nothing. A project without a
 * weight is unknown, and a policy applied to half a workspace is a different
 * policy from the one the user set.
 */
export function Measuring({ measured, total }: { measured: number; total: number }) {
  return (
    <Panel icon={<Gauge size={22} strokeWidth={1.5} aria-hidden="true" />} title={`Measuring ${measured} of ${total} projects`}>
      <p>The selection appears once every project has a weight. Nothing is measured twice.</p>
    </Panel>
  );
}

export function NoProjects({ roots }: { roots: number }) {
  return (
    <Panel
      icon={<FolderSearch size={22} strokeWidth={1.5} aria-hidden="true" />}
      title={`No projects in the ${roots === 1 ? "folder" : `${roots} folders`} you chose`}
    >
      <p>A project is a directory with a repository or a manifest in it.</p>
    </Panel>
  );
}

export function IndexFailed({ message }: { message: string }) {
  return (
    <Panel icon={<TriangleAlert size={22} strokeWidth={1.5} aria-hidden="true" />} title="Your folders could not be read">
      <p className="font-mono text-[11px] break-words">{message}</p>
    </Panel>
  );
}

/**
 * What Free is shown instead of the run button.
 *
 * The selection itself stays on screen: it is read from an index Free already
 * builds, and hiding it would mean charging for the sentence that makes anyone
 * want the feature. What Pro adds is the run, and the record of it.
 */
export function ProPanel() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-pro-200/30 bg-pro-surface p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl">
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-md border border-pro-200/30 bg-forest-950 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-pro-100">
            <LockKeyhole size={11} aria-hidden="true" />
            <span>Pro Maintenance</span>
          </div>

          <h2 className="text-base font-semibold text-mist-100">Pro is what runs this policy</h2>

          <p className="mt-2 text-xs leading-relaxed text-mist-500">
            The selection below is the one a run acts on, and it is the same on every plan. Pro
            performs the run, repeats it on a schedule without you, and records what each one
            removed.
          </p>
        </div>

        <button
          type="button"
          onClick={() => openExternalUrl("https://uncached.app/pro")}
          className="inline-flex items-center gap-1.5 rounded-xl bg-pro-200 px-4 py-2.5 text-xs font-semibold text-forest-950 shadow-sm transition-all hover:opacity-90 active:scale-[0.99]"
        >
          <Sparkles size={13} aria-hidden="true" />
          <span>Get Uncached Pro</span>
        </button>
      </div>
    </div>
  );
}
