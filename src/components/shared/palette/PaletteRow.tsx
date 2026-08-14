import type { PaletteCommand } from "./usePaletteCommands";

/** One line of the palette. Hovering moves the cursor, so mouse and keyboard agree. */
export function PaletteRow({
  item,
  active,
  onHover,
  onSelect,
}: {
  item: PaletteCommand;
  active: boolean;
  onHover: () => void;
  onSelect: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      data-active={active}
      onMouseMove={onHover}
      onClick={onSelect}
      className={`flex w-full items-center gap-3 px-4 py-2 text-left transition-colors ${
        active ? "bg-forest-800" : ""
      }`}
    >
      <Icon size={14} className={active ? "shrink-0 text-sage-300" : "shrink-0 text-mist-500"} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-mist-100">{item.title}</span>
        {item.subtitle && (
          <span className="block truncate font-mono text-[10px] text-mist-500">{item.subtitle}</span>
        )}
      </span>
      {item.detail && <span className="shrink-0 font-mono text-[10px] text-mist-500">{item.detail}</span>}
    </button>
  );
}
