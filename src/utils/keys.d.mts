/** Mirrors `keys.mjs` so the module can be consumed from TypeScript. */

export type Binding = {
  key: string;
  cmd: boolean;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
};

export declare function parseBinding(binding: unknown): Binding | null;
export declare function matchesBinding(
  event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">,
  binding: string | Binding | null,
): boolean;
export declare function isTyping(target: unknown, binding: string | Binding | null): boolean;
export declare function formatBinding(binding: string): string;
export declare function resolveBindings(
  defaults: Record<string, string>,
  overrides: Record<string, string> | undefined | null,
): Record<string, string>;
export declare function toAccelerator(binding: string): string;
export declare function bindingFrom(
  event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">,
): string | null;
export declare function conflictsIn(bindings: Record<string, string>): string[][];
