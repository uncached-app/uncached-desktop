// The Free boundary is decided in Rust and stamped on every scan target as
// `plan`. These helpers only read that field: duplicating the category rule
// here would let the UI drift from what the native layer actually allows.

export function isFreeTarget(target) {
  return target.plan === "free";
}

export function summarizePlans(targets) {
  return targets.reduce(
    (summary, target) => {
      const key = isFreeTarget(target) ? "freeBytes" : "proBytes";
      summary[key] += target.sizeBytes;
      return summary;
    },
    { freeBytes: 0, proBytes: 0 },
  );
}
