import { createContext, useContext } from "react";

/**
 * How anything on screen reaches the palette.
 *
 * A context holding one function rather than props threaded through every
 * screen: the palette belongs to the shell, and the shell is the only thing
 * that should know it exists. The default is a no-op so a component rendered
 * outside the shell — in a test, in isolation — still works and simply has
 * nothing to open.
 */
export const CommandPaletteContext = createContext<() => void>(() => {});

export function useOpenCommandPalette() {
  return useContext(CommandPaletteContext);
}
