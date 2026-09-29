import i18n from "i18next";

/**
 * A backend refusal in the reader's language, chosen by its code.
 *
 * The core's own `message` is English and stable per code, so it is only the
 * fallback for a code this build does not know yet. `operation` carries the
 * running program's name for `target_in_use`.
 */
export function describeError(info: {
  code: string;
  message: string;
  operation?: string | null;
}): string {
  return i18n.t(`shell.errors.${info.code}` as never, {
    program: info.operation ?? "",
    defaultValue: info.message,
  });
}

type CommandError = { code: string; message: string; params?: Record<string, string> };

function isCommandError(value: unknown): value is CommandError {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as CommandError).code === "string" &&
    typeof (value as CommandError).message === "string"
  );
}

/**
 * A refusal from a native command, in the reader's language.
 *
 * `scope` is where that command's sentences live in the catalogue. A `date`
 * param arrives as `YYYY-MM-DD` and is written in the reader's calendar. Plain
 * strings and unknown codes are shown as the backend wrote them.
 */
export function describeCommandError(error: unknown, scope: string, fallback: string): string {
  if (typeof error === "string") return error;
  if (!isCommandError(error)) return fallback;
  const params: Record<string, string> = { ...(error.params ?? {}) };
  if (params.date) {
    const date = new Date(`${params.date}T00:00:00Z`);
    if (!Number.isNaN(date.getTime())) {
      params.date = date.toLocaleDateString(i18n.language, { timeZone: "UTC", dateStyle: "long" });
    }
  }
  return i18n.t(`${scope}.${error.code}` as never, { ...params, defaultValue: error.message });
}
