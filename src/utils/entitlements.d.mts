export type Plan = "free" | "pro";

export function isFreeTarget(target: { plan: Plan }): boolean;
export function summarizePlans(targets: Array<{ plan: Plan; sizeBytes: number }>): {
  freeBytes: number;
  proBytes: number;
};
