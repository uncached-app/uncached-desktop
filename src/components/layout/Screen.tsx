import type { ReactNode } from "react";

type ScreenProps = {
  /** Where the content sits when it does not fill the frame. */
  align?: "center" | "start";
  children: ReactNode;
};

/**
 * The frame every screen renders inside. Owns padding and alignment so those
 * are changed in one place rather than in each screen.
 */
export function Screen({ align = "center", children }: ScreenProps) {
  return (
    <div
      className={`flex min-h-0 w-full flex-1 flex-col overflow-hidden px-5 py-5 sm:px-8 lg:px-12 ${align === "center" ? "items-center justify-center" : "items-stretch justify-start"
        }`}
    >
      {children}
    </div>
  );
}
