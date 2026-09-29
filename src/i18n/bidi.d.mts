/** Mirrors `bidi.mjs` so the module can be consumed from TypeScript. */
export declare const bidiIsolateFormatter: {
  type: "formatter";
  init(): void;
  add(): void;
  addCached(): void;
  format(value: unknown, format: string | undefined, lng: string | undefined): string;
};
