import { setupWorker } from "msw/browser";

import { handlers } from "./handlers";

/** The service worker used by `npm run dev:mock`. Started in main.tsx. */
export const worker = setupWorker(...handlers);
