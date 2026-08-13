import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { IgnoreRuleReview } from "../types/settings";

/**
 * How many ignore rules are currently in force.
 *
 * Asked of Rust rather than counted here. Splitting the text on newlines would
 * be close enough to look right and wrong in exactly the cases that matter — a
 * comment, a blank line, a rule that failed to compile — and the list deciding
 * what a scan skips is the only one entitled to say how long it is.
 *
 * Returns 0 while the answer is in flight, and on failure. An overstated count
 * would have the interface explain away a finding that was never suppressed.
 */
export function useIgnoreRuleCount(text: string): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (text.trim().length === 0) {
      setCount(0);
      return;
    }
    let current = true;
    void invoke<IgnoreRuleReview>("review_ignore_rules", { text })
      .then((review) => { if (current) setCount(review.active); })
      .catch(() => { if (current) setCount(0); });
    return () => { current = false; };
  }, [text]);

  return count;
}
