import { useTranslation } from "react-i18next";
import { CommandLine } from "../../shared/CommandLine";
import type { ExposedSecret } from "../../../types/workspace";
import { secretFixCommand } from "../../../utils/secrets.mjs";
import { Panel } from "./panels";

/** Credentials Git would publish, each with the command that stops it. */
export function SecretsPanel({ files }: { files: ExposedSecret[] }) {
  const { t } = useTranslation();
  const anyCommitted = files.some((file) => file.committed);

  return (
    <Panel title={t("workspace.project.secrets.title")}>
      <p className="text-sm leading-6 text-coral-300">
        {anyCommitted ? t("workspace.project.secrets.introCommitted") : t("workspace.project.secrets.introUnignored")}
      </p>
      <ul className="mt-4 grid gap-4">
        {files.map((file) => (
          <li key={file.path}>
            <div className="flex min-w-0 items-center justify-between gap-3">
              <span className="truncate font-mono text-xs font-semibold text-mist-100 select-text" title={file.path}>
                {file.path}
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                <span className="rounded-md border border-forest-800 bg-forest-850 px-2 py-0.5 text-[11px] font-medium text-mist-300">
                  {t(`workspace.project.secrets.kinds.${file.kind}`)}
                </span>
                <span className="rounded-md border border-coral-300/40 bg-coral-surface px-2 py-0.5 text-[11px] font-medium text-coral-300">
                  {file.committed ? t("workspace.project.secrets.committed") : t("workspace.project.secrets.unignored")}
                </span>
              </span>
            </div>
            <p className="mt-1 text-xs text-mist-500">
              {file.committed ? t("workspace.project.secrets.committedHint") : t("workspace.project.secrets.unignoredHint")}
            </p>
            <CommandLine
              className="mt-2"
              command={secretFixCommand(file)}
              copyLabel={t("workspace.project.secrets.copy", { path: file.path })}
            />
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[11px] text-mist-500">{t("workspace.project.secrets.runFromRoot")}</p>
    </Panel>
  );
}
