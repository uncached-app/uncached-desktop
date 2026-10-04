import { useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import type { AppSettings, IgnoreRuleReview } from "../../../types/settings";
import type { UpdateSettings } from "../types";

const IGNORE_RULES_PLACEHOLDER = `node_modules
~/Library/Caches/Homebrew
/Users/me/work/client-project
!/Users/me/work/client-project/scratch`;

export function IgnoreRulesContent({
  settings,
  updateSettings,
}: {
  settings: AppSettings;
  updateSettings: UpdateSettings;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(settings.ignoreRules);
  const [review, setReview] = useState<IgnoreRuleReview | null>(null);

  useEffect(() => {
    setDraft(settings.ignoreRules);
  }, [settings.ignoreRules]);

  useEffect(() => {
    let current = true;
    void invoke<IgnoreRuleReview>("review_ignore_rules", { text: draft })
      .then((result) => {
        if (current) setReview(result);
      })
      .catch(() => {
        if (current) setReview(null);
      });
    return () => {
      current = false;
    };
  }, [draft]);

  const problemLines = new Set((review?.problems ?? []).map((problem) => problem.line));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <p className="text-xs leading-5 text-mist-500">
        <Trans
          i18nKey="settings.ignoreRules.intro"
          values={{ syntax: ".gitignore", negation: "!" }}
          components={{ mono: <span className="font-mono text-mist-300" /> }}
        />
      </p>

      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (draft !== settings.ignoreRules) void updateSettings({ ignoreRules: draft });
        }}
        spellCheck={false}
        placeholder={IGNORE_RULES_PLACEHOLDER}
        aria-label={t("settings.sections.ignoreRules")}
        aria-invalid={problemLines.size > 0}
        className="mt-4 min-h-44 flex-1 resize-none rounded-2xl border border-forest-800 bg-forest-950 p-4 font-mono text-xs leading-6 placeholder:text-mist-500/60 focus:outline-none focus:border-sage-400/60 shadow-2xs"
      />

      <div className="mt-3.5 shrink-0 space-y-2" aria-live="polite">
        {review &&
          review.problems.length > 0 &&
          review.problems.map((problem) => (
            <p
              key={problem.line}
              className="rounded-xl bg-confidence-review-surface px-4 py-2.5 text-xs leading-5 text-confidence-review"
            >
              {/* User text goes in as component children, never as `values`: Trans
                  parses the interpolated string for tags. */}
              <Trans
                i18nKey="settings.ignoreRules.problem"
                values={{ line: problem.line }}
                components={{
                  bold: <span className="font-semibold" />,
                  rule: <span className="font-mono">{problem.text.trim()}</span>,
                  reason: <>{problem.reason}</>,
                }}
              />
            </p>
          ))}
        {review && (
          <p className="text-xs text-mist-500">
            {review.active === 0
              ? t("settings.ignoreRules.empty")
              : t("settings.ignoreRules.inForce", { count: review.active })}
          </p>
        )}
      </div>
    </div>
  );
}
