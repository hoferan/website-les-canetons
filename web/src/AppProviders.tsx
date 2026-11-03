import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { BlocksGate, BlocksProvider } from "./content/BlocksProvider";
import { EditModeProvider } from "./content/EditMode";
import { SessionProvider } from "./session/SessionProvider";

/**
 * The providers main.tsx mounts the app in.
 *
 * The order keeps the boot reads parallel: BlocksProvider asks for the blocks
 * and renders SessionProvider at once, which asks for the config and the
 * session. Only the pages wait for the blocks, in BlocksGate, under the
 * session gate.
 */
export function AppProviders({
  queryClient,
  children,
}: {
  queryClient: QueryClient;
  children: ReactNode;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <BlocksProvider>
        <SessionProvider>
          <BlocksGate>
            <EditModeProvider>{children}</EditModeProvider>
          </BlocksGate>
        </SessionProvider>
      </BlocksProvider>
    </QueryClientProvider>
  );
}
