import { screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { useState, type ReactNode } from "react";
import type { UseFormReturn } from "react-hook-form";

import { Toaster } from "../components/ui/sonner";
import { BlockEditor } from "../content/editor";
import type { BlockData, BlockKey } from "../content/registry";
import { setMockUser } from "../mocks/handlers";
import { server } from "../mocks/node";
import { renderWithSession } from "./renderWithSession";

export type BlockPut = { key: string; body: unknown };

/**
 * Every block write the page sends, in order. The caller removes the listener
 * in its own afterEach, as EditableText.test.tsx does.
 */
export function recordBlockPuts(): BlockPut[] {
  const puts: BlockPut[] = [];
  server.events.on("request:start", async ({ request }) => {
    const path = new URL(request.url).pathname;
    if (request.method === "PUT" && path.startsWith("/api/v1/blocks/")) {
      puts.push({
        key: decodeURIComponent(path.slice("/api/v1/blocks/".length)),
        body: await request.clone().json(),
      });
    }
  });
  return puts;
}

/** The band's stored block, as GET /api/v1/blocks lists it. */
export function storeBlock(key: BlockKey, data: unknown) {
  server.use(
    http.get("/api/v1/blocks", () =>
      HttpResponse.json({
        data: [{ key, data, updatedAt: "2026-11-03T10:00:00+00:00" }],
        meta: { total: 1, limit: 500, offset: 0 },
      }),
    ),
  );
}

/**
 * One block's editor, open, as an editor holding `content.manage` sees it,
 * with the fields a test needs. Closing it leaves an "Ouvrir" button behind,
 * so a test can tell that it closed and open it again.
 */
export async function renderBlockEditor<K extends BlockKey>(
  blockKey: K,
  fields: (form: UseFormReturn<BlockData<K>>) => ReactNode,
) {
  setMockUser("demo.direction");

  function Harness() {
    const [open, setOpen] = useState(true);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Ouvrir
        </button>
        <BlockEditor blockKey={blockKey} open={open} onClose={() => setOpen(false)}>
          {fields}
        </BlockEditor>
        <Toaster />
      </>
    );
  }

  await renderWithSession(<Harness />);
  return screen.findByRole("dialog");
}
