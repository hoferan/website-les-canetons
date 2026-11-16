import { QueryClient } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { AppProviders } from "../AppProviders";
import { BOOT_READS } from "./bootReads";

// The shell preloads BOOT_READS (vite.config.ts). A preload is used only by a
// request for the same URL with the same credentials mode, so this records
// what the providers ask for before the first page draws, and in which mode.
it("preloads exactly the reads the app waits for at boot", async () => {
  const spy = vi.spyOn(globalThis, "fetch");

  render(
    <AppProviders queryClient={new QueryClient()}>
      <p>page</p>
    </AppProviders>,
  );
  await screen.findByText("page");

  const reads = spy.mock.calls.map(([url, init]) => ({
    url: String(url),
    credentials: init?.credentials,
  }));
  expect(reads.map((read) => read.url).sort()).toEqual([...BOOT_READS].sort());
  // crossorigin="use-credentials" on the preload is credentials: "include".
  for (const read of reads) expect(read.credentials).toBe("include");
});
