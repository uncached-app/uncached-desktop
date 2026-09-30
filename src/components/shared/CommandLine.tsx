import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { copyText } from "../../utils/clipboard";

/** A command shown to be copied and run by the reader. The app never runs it. */
export function CommandLine({
  command,
  copyLabel,
  className = "",
}: {
  command: string;
  /** Names what is copied, since the button itself is only an icon. */
  copyLabel: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copyCommand() {
    try {
      await copyText(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div
      className={`flex min-w-0 items-center gap-2 rounded-lg border border-forest-800 bg-forest-950 py-1 ps-3 pe-1 ${className}`}
    >
      <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-mist-300 select-text">{command}</code>
      <button
        type="button"
        onClick={copyCommand}
        aria-label={copyLabel}
        className="grid size-7 shrink-0 place-items-center rounded-md text-mist-500 transition-colors hover:bg-forest-800 hover:text-mist-100"
      >
        {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
      </button>
    </div>
  );
}
