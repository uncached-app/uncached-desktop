import type { ExposedSecret } from "../types/workspace";

export function shellQuote(word: string): string;

export function secretFixCommand(entry: Pick<ExposedSecret, "path" | "committed">): string;
