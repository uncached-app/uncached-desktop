export function requiresPermanentConfirmation(mode, confirmation) {
  return mode === "Permanent" && confirmation !== "Nuke";
}

export function getCleanupCopy(mode, removed) {
  const noun = removed === 1 ? "item" : "items";

  if (mode === "Permanent") {
    return {
      result: `${removed} ${noun} permanently deleted.`,
      recovery: "This action cannot be undone.",
    };
  }

  return {
    result: `${removed} ${noun} moved to your system Trash.`,
    recovery: "You can restore them from the Trash if needed.",
  };
}
