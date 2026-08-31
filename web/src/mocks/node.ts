import { setupServer } from "msw/node";

import { handlers } from "./handlers";

/** The interceptor used by the Vitest suite. Wired up in web/src/setupTests.ts. */
export const server = setupServer(...handlers);
