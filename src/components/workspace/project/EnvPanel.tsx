import { useTranslation } from "react-i18next";
import { CommandLine } from "../../shared/CommandLine";
import type { ExposedEnv } from "../../../types/workspace";
import { envFixCommand } from "../../../utils/envExposure.mjs";
import { Panel } from "./panels";

/** Env files Git would publish, each with the command that stops it. */
export function EnvPanel({ files }: { files: ExposedEnv[] }) {
  const { t } = useTranslation();
  const anyCommitted = files.some((file) => file.committed);

  return (
    <Panel title={t("workspace.project.env.title")}>
      <p className="text-sm leading-6 text-coral-300">
        {anyCommitted ? t("workspace.project.env.introCommitted") : t("workspace.project.env.introUnignored")}
      </p>
      <ul className="mt-4 grid gap-4">
        {files.map((file) => (
          <li key={file.path}>
            <div className="flex min-w-0 items-center justify-between gap-3">
              <span className="truncate font-mono text-xs font-semibold text-mist-100 select-text" title={file.path}>
                {file.path}
              </span>
              <span className="shrink-0 rounded-md border border-coral-300/40 bg-coral-surface px-2 py-0.5 text-[11px] font-medium text-coral-300">
                {file.committed ? t("workspace.project.env.committed") : t("workspace.project.env.unignored")}
              </span>
            </div>
            <p className="mt-1 text-xs text-mist-500">
              {file.committed ? t("workspace.project.env.committedHint") : t("workspace.project.env.unignoredHint")}
            </p>
            <CommandLine
              className="mt-2"
              command={envFixCommand(file)}
              copyLabel={t("workspace.project.env.copy", { path: file.path })}
            />
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[11px] text-mist-500">{t("workspace.project.env.runFromRoot")}</p>
    </Panel>
  );
}
