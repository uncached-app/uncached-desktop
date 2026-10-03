import type { AppSettings } from "../../types/settings";

/** How a settings section asks for a change; the panel owns saving it. */
export type UpdateSettings = (patch: Partial<AppSettings>) => Promise<void>;
