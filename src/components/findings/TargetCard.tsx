import { useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { Box, Check, Copy, Folder, FolderOpen, Layers, LoaderCircle, LockKeyhole, Package, RefreshCw, Terminal } from "lucide-react";
import type { ScanTarget } from "../../types/scan";

interface TargetCardProps {
  target: ScanTarget;
  isCleaning: boolean;
  selected: boolean;
  onToggle: (targetId: string) => void;
  onRefreshSize: (targetId: string) => void;
  proEnabled: boolean;
}

export function TargetCard({ target, isCleaning, selected, onToggle, onRefreshSize, proEnabled }: TargetCardProps) {
  const [copiedPath, setCopiedPath] = useState(false);
  const [copiedCommand, setCopiedCommand] = useState(false);
  const proLocked = target.plan === "pro" && !proEnabled;
  const disabled = isCleaning || target.sizePending || target.sizeHasErrors || proLocked;

  function getDeleteCommand(path: string): string {
    const isWindows =
      typeof window !== "undefined" &&
      (navigator.platform?.toLowerCase().includes("win") || navigator.userAgent?.toLowerCase().includes("win"));
    if (isWindows) {
      return `Remove-Item -Recurse -Force -LiteralPath "${path}"`;
    }
    return `rm -rf "${path}"`;
  }

  async function handleCopyPath(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(target.path);
      setCopiedPath(true);
      setTimeout(() => setCopiedPath(false), 2000);
    } catch (err) {
      console.error("Failed to copy path", err);
    }
  }

  async function handleCopyCommand(e: React.MouseEvent) {
    e.stopPropagation();
    const cmd = getDeleteCommand(target.path);
    try {
      await navigator.clipboard.writeText(cmd);
      setCopiedCommand(true);
      setTimeout(() => setCopiedCommand(false), 2000);
    } catch (err) {
      console.error("Failed to copy command", err);
    }
  }

  async function handleRevealFolder(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      if (isTauri()) {
        await revealItemInDir(target.path);
      }
    } catch (err) {
      console.error("Failed to reveal folder", err);
    }
  }

  function getCategoryIcon(category: string) {
    const cat = category.toUpperCase();
    if (cat.includes("NODE")) return <Package size={12} className="text-sage-300" aria-hidden="true" />;
    if (cat.includes("CARGO") || cat.includes("RUST") || cat.includes("BUILD")) {
      return <Box size={12} className="text-sage-300" aria-hidden="true" />;
    }
    if (cat.includes("FOLDER") || cat.includes("DIR")) {
      return <Folder size={12} className="text-sage-300" aria-hidden="true" />;
    }
    return <Layers size={12} className="text-sage-300" aria-hidden="true" />;
  }

  return (
    <article
      onClick={() => {
        if (!disabled) onToggle(target.id);
      }}
      className={`group grid select-none gap-3 rounded-2xl border p-4 transition-all duration-200 sm:grid-cols-[1fr_auto] sm:items-center ${
        disabled
          ? "cursor-not-allowed border-forest-800 bg-forest-900 text-mist-500"
          : selected
          ? "cursor-pointer border-sage-400 bg-forest-900"
          : "cursor-pointer border-forest-800 bg-forest-900 hover:border-sage-400"
      }`}
    >
      <div className="flex min-w-0 items-start gap-3.5">
        <div
          role="checkbox"
          aria-checked={selected}
          tabIndex={disabled ? -1 : 0}
          onKeyDown={(e) => {
            if ((e.key === " " || e.key === "Enter") && !disabled) {
              e.preventDefault();
              onToggle(target.id);
            }
          }}
          className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border transition-all ${
            selected
              ? "border-sage-400 bg-sage-400 text-forest-950"
              : "border-forest-700 bg-forest-950 text-transparent group-hover:border-sage-400"
          }`}
        >
          <Check size={13} strokeWidth={3} aria-hidden="true" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-forest-800 bg-forest-800 px-2 py-0.5 font-mono text-[11px] font-medium tracking-wide text-sage-300">
              {getCategoryIcon(target.category)}
              {target.category}
            </span>
            <span className="text-xs font-medium text-mist-500">{target.name}</span>
            {proLocked && (
              <span className="inline-flex items-center gap-1 rounded-md border border-pro-200/30 bg-pro-surface px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-pro-100">
                <LockKeyhole size={10} aria-hidden="true" /> Pro
              </span>
            )}
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <p
              className="min-w-0 flex-1 truncate font-mono text-xs leading-5 text-mist-500"
              title={target.path}
            >
              {target.path}
            </p>

            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={handleCopyPath}
                className="inline-flex items-center gap-1 rounded-md border border-forest-800 bg-forest-850 px-2 py-0.5 font-sans text-[11px] font-medium text-mist-300 transition-colors hover:border-sage-400/50 hover:bg-forest-800 hover:text-sage-300"
                title="Copy folder path to clipboard"
                aria-label="Copy folder path"
              >
                {copiedPath ? (
                  <Check size={11} className="text-sage-300" strokeWidth={2.5} aria-hidden="true" />
                ) : (
                  <Copy size={11} aria-hidden="true" />
                )}
                <span>{copiedPath ? "Copied" : "Path"}</span>
              </button>

              <button
                type="button"
                onClick={handleCopyCommand}
                className="inline-flex items-center gap-1 rounded-md border border-forest-800 bg-forest-850 px-2 py-0.5 font-sans text-[11px] font-medium text-mist-300 transition-colors hover:border-sage-400/50 hover:bg-forest-800 hover:text-sage-300"
                title={`Copy terminal delete command: ${getDeleteCommand(target.path)}`}
                aria-label="Copy terminal delete command"
              >
                {copiedCommand ? (
                  <Check size={11} className="text-sage-300" strokeWidth={2.5} aria-hidden="true" />
                ) : (
                  <Terminal size={11} aria-hidden="true" />
                )}
                <span>{copiedCommand ? "Copied" : "rm cmd"}</span>
              </button>

              {isTauri() && (
                <button
                  type="button"
                  onClick={handleRevealFolder}
                  className="inline-flex items-center gap-1 rounded-md border border-forest-800 bg-forest-850 px-1.5 py-0.5 font-sans text-[11px] font-medium text-mist-300 transition-colors hover:border-sage-400/50 hover:bg-forest-800 hover:text-sage-300"
                  title="Reveal in Finder / Explorer"
                  aria-label="Reveal in Finder or Explorer"
                >
                  <FolderOpen size={11} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-4 pl-8 sm:pl-0">
        <div className="text-right">
          {proLocked ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-pro-100">
              <LockKeyhole size={14} aria-hidden="true" /> Unlock to clean
            </span>
          ) : target.sizePending ? (
            <span className="inline-flex items-center gap-2 text-sm text-mist-500">
              <LoaderCircle size={16} className="animate-spin text-sage-400" aria-hidden="true" /> Loading size
            </span>
          ) : target.sizeHasErrors ? (
            <div className="flex flex-col items-end gap-1">
              <span className="text-xs font-medium text-amber-300">Size unavailable</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRefreshSize(target.id);
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-forest-800 px-2.5 py-1 text-xs font-medium text-amber-300 hover:bg-forest-850"
                aria-label={`Size failed for ${target.name}. Retry measurement`}
              >
                <RefreshCw size={13} aria-hidden="true" /> Retry
              </button>
            </div>
          ) : (
            <strong className={`block text-lg font-semibold ${selected ? "text-mist-100" : "text-mist-300"}`}>
              {target.formattedSize}
            </strong>
          )}
        </div>
      </div>
    </article>
  );
}

