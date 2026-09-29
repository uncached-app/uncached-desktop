import type { LucideIcon } from "lucide-react";

/**
 * One line of a floating list: the palette's rows and the workspace map's
 * context menu.
 *
 * Shared because the two are the same thing at different sizes — an icon, a
 * verb, an optional path under it and an optional figure at the end — and the
 * context menu was drawn separately with a smaller icon, tighter padding and a
 * different type scale, which is exactly how a second surface stops looking
 * like the first.
 *
 * Hovering sets `active` in the palette, so mouse and keyboard agree on where
 * the cursor is. A menu with no keyboard cursor passes `active={false}` and
 * gets the hover styling instead.
 */
export function MenuRow({
  icon: Icon,
  title,
  subtitle,
  detail,
  active = false,
  onHover,
  onSelect,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  /** Right-hand text: a size, a repository, a hint. */
  detail?: string;
  active?: boolean;
  onHover?: () => void;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      data-active={active}
      onMouseMove={onHover}
      onClick={onSelect}
      className={`flex w-full items-center gap-3 px-4 py-2 text-start transition-colors ${
        active ? "bg-forest-800" : onHover ? "" : "hover:bg-forest-800"
      }`}
    >
      <Icon
        size={14}
        className={active ? "shrink-0 text-sage-300" : "shrink-0 text-mist-500"}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-mist-100">{title}</span>
        {subtitle && (
          <span className="block truncate font-mono text-[10px] text-mist-500">{subtitle}</span>
        )}
      </span>
      {detail && <span className="shrink-0 font-mono text-[10px] text-mist-500">{detail}</span>}
    </button>
  );
}
