import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { HttpResponse, delay, http } from "msw";
import { expect, test, vi } from "vitest";

import { setLocale } from "../i18n";
import { server } from "../mocks/node";
import { BlocksGate, BlocksProvider, useBlock, useBlockStored } from "./BlocksProvider";
import { BLOCKS } from "./registry";
import { tr } from "./translated";

function Probe() {
  const hero = useBlock("join.hero");
  const stored = useBlockStored("join.hero");
  return (
    <>
      <h1 data-testid="title">{tr(hero.title)}</h1>
      <p data-testid="stored">{stored ? "stored" : "default"}</p>
    </>
  );
}

function renderProvider() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <BlocksProvider>
        <BlocksGate>
          <Probe />
        </BlocksGate>
      </BlocksProvider>
    </QueryClientProvider>,
  );
}

const stored = (data: unknown) =>
  http.get("/api/v1/blocks", () =>
    HttpResponse.json({
      data: [{ key: "join.hero", data, updatedAt: "2026-11-03T10:00:00+00:00" }],
      meta: { total: 1, limit: 100, offset: 0 },
    }),
  );

const shipped = () => tr(BLOCKS["join.hero"].defaults().title);

test("useBlock returns the default when nothing is stored", async () => {
  renderProvider();

  // Compared exactly: the catalogue wording may carry no-break spaces, which
  // toHaveTextContent normalises on one side only.
  expect((await screen.findByTestId("title")).textContent).toBe(shipped());
  expect(screen.getByTestId("stored")).toHaveTextContent("default");
});

test("a stored block replaces the default", async () => {
  server.use(stored({ title: { fr: "Viens jouer avec nous !" } }));
  renderProvider();

  expect(await screen.findByTestId("title")).toHaveTextContent("Viens jouer avec nous !");
  expect(screen.getByTestId("stored")).toHaveTextContent("stored");
});

test("a stored block of the wrong shape falls back to the default and warns", async () => {
  // Stored by a newer build, or under a type since changed: the page shows
  // the shipped content and keeps working.
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  server.use(stored({ title: "a bare string, not {fr, de}" }));
  renderProvider();

  expect((await screen.findByTestId("title")).textContent).toBe(shipped());
  expect(warn).toHaveBeenCalled();
  expect(String(warn.mock.calls[0]?.[0])).toContain("join.hero");
});

test("a stored block the editor's checks would refuse is still read as stored", async () => {
  // The server checks no numbers and no links, so an import or a direct
  // write can store what the editor would not let through. The page shows
  // it rather than the shipped content.
  const contact = {
    cards: [
      {
        id: "contact",
        icon: "phone",
        tint: "yellow",
        title: { fr: "Contact" },
        rows: [
          { type: "phone", label: { fr: "Réservations" }, number: "079 123 45 67 / 026 123 45 67" },
          { type: "link", label: { fr: "Site" }, url: "http://lescanetons.ch" },
        ],
      },
    ],
  };
  server.use(
    http.get("/api/v1/blocks", () =>
      HttpResponse.json({
        data: [{ key: "committee.contact", data: contact, updatedAt: "2026-11-03T10:00:00+00:00" }],
        meta: { total: 1, limit: 100, offset: 0 },
      }),
    ),
  );
  function ContactProbe() {
    return <pre data-testid="contact">{JSON.stringify(useBlock("committee.contact"))}</pre>;
  }
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <BlocksProvider>
        <BlocksGate>
          <ContactProbe />
        </BlocksGate>
      </BlocksProvider>
    </QueryClientProvider>,
  );

  const read = JSON.parse((await screen.findByTestId("contact")).textContent ?? "") as unknown;
  expect(read).toEqual(contact);
});

test("tr shows French when German is blank", async () => {
  // A name typed once is the same on the German page; a blank German field
  // must not empty it.
  server.use(stored({ title: { fr: "Les Canetons", de: "  " } }));
  await setLocale("de-CH");
  renderProvider();

  expect(await screen.findByTestId("title")).toHaveTextContent("Les Canetons");
});

test("tr shows German when there is German", async () => {
  server.use(stored({ title: { fr: "Bonjour", de: "Grüezi" } }));
  await setLocale("de-CH");
  renderProvider();

  expect(await screen.findByTestId("title")).toHaveTextContent("Grüezi");
});

test("the gate holds its children for the blocks, at most 1.5 s", async () => {
  server.use(
    http.get("/api/v1/blocks", async () => {
      await delay("infinite");
      return HttpResponse.json({});
    }),
  );
  renderProvider();

  // A first paint in the shipped content would flash, then change.
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(screen.queryByTestId("title")).toBeNull();

  // Every block has its default, so a slow server costs a flash at worst,
  // never a blank page.
  expect((await screen.findByTestId("title", {}, { timeout: 3000 })).textContent).toBe(shipped());
});

test("the provider asks for the blocks and nothing else", async () => {
  // That the boot reads run in parallel is AppProviders.test's job; this
  // pins that the provider itself needs no session.
  const requests: string[] = [];
  server.events.on("request:start", ({ request }) => {
    requests.push(new URL(request.url).pathname);
  });
  renderProvider();

  await screen.findByTestId("title");
  server.events.removeAllListeners();
  expect(requests).toEqual(["/api/v1/blocks"]);
});

test("a failing read renders the defaults", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  server.use(http.get("/api/v1/blocks", () => HttpResponse.json({}, { status: 500 })));
  renderProvider();

  expect((await screen.findByTestId("title")).textContent).toBe(shipped());
  await vi.waitFor(() => expect(error).toHaveBeenCalled());
});

test("a component outside the provider renders the defaults", () => {
  render(<Probe />);

  expect(screen.getByTestId("title").textContent).toBe(shipped());
});
