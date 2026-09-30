import { ChevronDown, ChevronUp } from "lucide-react";
import { useTranslation } from "react-i18next";

/** The control under a list cut by `useShowMore`. Renders nothing when there is nothing to toggle. */
export function ShowMore({
  remaining,
  step,
  canCollapse,
  onShowMore,
  onCollapse,
}: {
  remaining: number;
  step: number;
  canCollapse: boolean;
  onShowMore: () => void;
  onCollapse: () => void;
}) {
  const { t } = useTranslation();
  if (remaining === 0 && !canCollapse) return null;
  const button =
    "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-mist-500 transition-colors hover:bg-forest-850 hover:text-sage-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sage-400 cursor-pointer";

  return (
    <div className="flex items-center justify-center gap-2">
      {remaining > 0 && (
        <button type="button" onClick={onShowMore} className={button}>
          <ChevronDown size={12} aria-hidden="true" />
          {t("shell.list.showMore", { count: Math.min(step, remaining), total: remaining })}
        </button>
      )}
      {canCollapse && (
        <button type="button" onClick={onCollapse} className={button}>
          <ChevronUp size={12} aria-hidden="true" />
          {t("shell.list.showLess")}
        </button>
      )}
    </div>
  );
}
