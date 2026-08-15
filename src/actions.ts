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
  | "toggleMap"
  | "toggleSidebar"
  | "focusFilter"
  | "rescan"
  | "quickClean";

export type Action = {
  id: ActionId;
  /** What it is called in the menu and in Settings. */
  label: string;
  /** Which menu it belongs under. `null` keeps it off the menu bar. */
  menu: "File" | "View" | "Workspace" | null;
  binding: string;
  /** Said in Settings, where a list of keys needs to be a list of reasons. */
  detail: string;
};

export const ACTIONS: Action[] = [
  {
    id: "palette",
    label: "Command Palette",
    menu: "File",
    binding: "cmd+k",
    detail: "Every project and every module, by name.",
  },
  {
    id: "rescan",
    label: "Scan Workspace",
    menu: "File",
    binding: "cmd+r",
    detail: "Reads the chosen folders again.",
  },
  {
    id: "quickClean",
    label: "Reclaim Disk",
    menu: "File",
    binding: "cmd+shift+x",
    detail: "Opens the artifacts the last scan found, ready to review.",
  },
  {
    id: "settings",
    label: "Settings",
    menu: null,
    binding: "cmd+,",
    detail: "The panel. macOS puts this one under the app menu itself.",
  },
  {
    id: "toggleMap",
    label: "Map",
    menu: "View",
    binding: "cmd+m",
    detail: "Switches between the list and the picture, and back.",
  },
  {
    id: "toggleSidebar",
    label: "Filters",
    menu: "View",
    binding: "cmd+b",
    detail: "Folds the filter column away and back.",
  },
  {
    id: "focusFilter",
    label: "Filter Projects",
    menu: "View",
    binding: "/",
    detail: "Jumps to the filter field from anywhere on the screen.",
  },
  {
    id: "workspace",
    label: "Workspace",
    menu: "Workspace",
    binding: "cmd+1",
    detail: "The projects, and what they weigh.",
  },
  {
    id: "maintenance",
    label: "Maintenance",
    menu: "Workspace",
    binding: "cmd+2",
    detail: "The policy, and what it would select.",
  },
  {
    id: "insights",
    label: "Insights",
    menu: "Workspace",
    binding: "cmd+3",
    detail: "The workspace as one picture, and what has been reclaimed.",
  },
];

/** The shipped bindings, which an override in `settings.json` replaces. */
export const DEFAULT_BINDINGS: Record<string, string> = Object.fromEntries(
  ACTIONS.map((action) => [action.id, action.binding]),
);
