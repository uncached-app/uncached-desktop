import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Check, ClipboardCopy, FolderOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { copyText } from "../../utils/clipboard";

type CopyState = "idle" | "copied" | "failed";

/** A support report to copy, and the folder the log lives in. Sends nothing. */
export function SupportActions() {
  const { t } = useTranslation();
  const [state, setState] = useState<CopyState>("idle");

  async function copyReport() {
    try {
      await copyText(await invoke<string>("diagnostic_report"));
      setState("copied");
    } catch {
      setState("failed");
    }
    window.setTimeout(() => setState("idle"), 2400);
  }

  return (
    <div className="mt-8 w-full max-w-sm border-t border-forest-800 pt-5">
      <h4 className="text-xs font-semibold text-mist-300">{t("settings.about.support.title")}</h4>
      <p className="mt-1 text-[11px] leading-5 text-mist-500">{t("settings.about.support.hint")}</p>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => void copyReport()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-forest-800 px-2.5 py-1.5 text-xs font-medium text-mist-300 hover:bg-forest-850 hover:text-sage-300 cursor-pointer"
        >
          {state === "copied" ? <Check size={13} aria-hidden="true" /> : <ClipboardCopy size={13} aria-hidden="true" />}
          {state === "copied" ? t("settings.about.support.copied") : t("settings.about.support.copy")}
        </button>
        <button
          type="button"
          onClick={() => void invoke("open_log_folder")}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-mist-500 hover:bg-forest-850 hover:text-mist-300 cursor-pointer"
        >
          <FolderOpen size={13} aria-hidden="true" />
          {t("settings.about.support.openLogs")}
        </button>
      </div>
      {state === "failed" && (
        <p role="alert" className="mt-2 text-[11px] text-coral-300">
          {t("settings.about.support.failed")}
        </p>
      )}
    </div>
  );
}
