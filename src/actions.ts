/**
 * What the app can be asked to do by name.
 *
 * One list, and everything that offers a shortcut reads it: the keyboard, the
 * macOS menu bar, and the screen in Settings that shows what is bound to what.
 * Three places offering the same verb under three different keys is the failure
 * this exists to make impossible — and it is the ordinary outcome of writing a
 * `keydown` handler next to each feature, which is how the app had exactly one
 * shortcut and no menu.
 *
 * The default is here and the override is in `settings.json`, so a binding the
 * user changed survives an update that changes the default.
 */
export type ActionId =
  | "palette"
  | "settings"
  | "workspace"
  | "maintenance"
  | "insights"
  | "toggleSidebar"
  | "focusFilter"
  | "rescan"
  | "quickClean";

export type Action = {
  id: ActionId;
  /** The native menu item's title. Settings reads `settings.shortcuts.actions.<id>` instead. */
  label: string;
  /** Which menu it belongs under. `null` keeps it off the menu bar. */
  menu: "File" | "View" | "Workspace" | null;
  binding: string;
};

export const ACTIONS: Action[] = [
  {
    id: "palette",
    label: "Command Palette",
    menu: "File",
    binding: "cmd+k",
  },
  {
    id: "rescan",
    label: "Scan Workspace",
    menu: "File",
    binding: "cmd+r",
  },
  {
    id: "quickClean",
    label: "Reclaim Disk",
    menu: "File",
    binding: "cmd+shift+x",
  },
  {
    id: "settings",
    label: "Settings",
    menu: null,
    binding: "cmd+,",
  },
  {
    id: "toggleSidebar",
    label: "Filters",
    menu: "View",
    binding: "cmd+b",
  },
  {
    id: "focusFilter",
    label: "Filter Projects",
    menu: "View",
    binding: "/",
  },
  {
    id: "workspace",
    label: "Workspace",
    menu: "Workspace",
    binding: "cmd+1",
  },
  {
    id: "maintenance",
    label: "Maintenance",
    menu: "Workspace",
    binding: "cmd+2",
  },
  {
    id: "insights",
    label: "Insights",
    menu: "Workspace",
    binding: "cmd+3",
  },
];

/** The shipped bindings, which an override in `settings.json` replaces. */
export const DEFAULT_BINDINGS: Record<string, string> = Object.fromEntries(
  ACTIONS.map((action) => [action.id, action.binding]),
);
