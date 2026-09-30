import type { ExposedEnv } from "../types/workspace";

export function shellQuote(word: string): string;

export function envFixCommand(entry: ExposedEnv): string;
