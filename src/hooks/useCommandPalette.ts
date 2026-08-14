import { createContext, useContext } from "react";
import type { WorkspaceProject } from "../types/workspace";

/**
 * How anything on screen reaches the palette.
 *
 * A context holding one function rather than props threaded through every
 * screen: the palette belongs to the shell, and the shell is the only thing
 * that should know it exists. The default is a no-op so a component rendered
 * outside the shell — in a test, in isolation — still works and simply has
 * nothing to open.
 *
 * Passing a project opens straight at its actions. That is what clicking a row
 * in the workspace means: the user has already chosen the project, and making
 * them find it again in a list they were just looking at is the interface
 * forgetting what happened one gesture ago.
 */
export const CommandPaletteContext = createContext<(project?: WorkspaceProject) => void>(() => {});

export function useOpenCommandPalette() {
  return useContext(CommandPaletteContext);
}
