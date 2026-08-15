import { MenuRow } from "../MenuRow";
import type { PaletteCommand } from "./usePaletteCommands";

/**
 * One line of the palette. Hovering moves the cursor, so mouse and keyboard
 * agree.
 *
 * The drawing lives in `MenuRow`, shared with the workspace map's context menu:
 * the two are the same row at different sizes, and they had drifted apart.
 */
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
  return (
    <MenuRow
      icon={item.icon}
      title={item.title}
      subtitle={item.subtitle}
      detail={item.detail}
      active={active}
      onHover={onHover}
      onSelect={onSelect}
    />
  );
}
