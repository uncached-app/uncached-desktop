import type { defaultNS, resources } from "./index";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: typeof defaultNS;
    resources: { translation: (typeof resources)["en"]["translation"] };
  }
}
