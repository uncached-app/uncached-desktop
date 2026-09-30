import { ShieldCheck, ShieldQuestion, TriangleAlert } from "lucide-react";
import type { ConfidenceLevel } from "../../types/scan";

export const CONFIDENCE_PRESENTATION: Record<
  ConfidenceLevel,
  { className: string; textClassName: string; arrowClassName: string; icon: typeof ShieldCheck }
> = {
  high: {
    className: "border-confidence-high/25 bg-confidence-high-surface text-confidence-high",
    textClassName: "text-confidence-high",
    arrowClassName: "border-t-confidence-high-surface",
    icon: ShieldCheck,
  },
  medium: {
    className: "border-confidence-medium/30 bg-confidence-medium-surface text-confidence-medium",
    textClassName: "text-confidence-medium",
    arrowClassName: "border-t-confidence-medium-surface",
    icon: TriangleAlert,
  },
  review: {
    className: "border-confidence-review/25 bg-confidence-review-surface text-confidence-review",
    textClassName: "text-confidence-review",
    arrowClassName: "border-t-confidence-review-surface",
    icon: ShieldQuestion,
  },
};
