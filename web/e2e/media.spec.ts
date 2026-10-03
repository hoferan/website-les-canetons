import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

/** A synthetic 1920 x 1275 JPEG, so the stored sizes below are known. */
const PHOTO = "web/e2e/fixtures/sample-photo.jpg";

/**
 * The media library's real upload path (#105): a file picked in the browser,
 * shrunk through a real canvas and sent as a real multipart body. jsdom has no
 * canvas and cannot send the body, so the Vitest file injects both steps and
 * this spec is the only place they run. Then the photo is placed where the
 * band page shows it, through the control under the slot.
 *
 * Against the MOCKED backend, like every spec here; see playwright.config.ts.
 * The mock's library lives in page memory, so the spec moves between screens
 * by clicking rather than with page.goto, which would reload it empty.
 */
async function logIn(page: Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("Identifiant").fill(username);
  await page.getByLabel("Mot de passe", { exact: true }).fill("demo");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("button", { name: `Compte de ${username}` })).toBeVisible();
}

test("a photo uploaded on /media can be placed on /band where the page shows it", async ({
  page,
}) => {
  await logIn(page, "demo.direction");
  await page.goto("/media");
  await expect(page.getByTestId("photos-summary")).toHaveText(/^2 \/ 100 photos/);

  const uploads: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/v1/images") {
      uploads.push(request.url());
    }
  });
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Ajouter des photos" }).click();
  await (await chooser).setFiles(PHOTO);

  // The mock numbers the first upload 3.
  const added = page.getByTestId("library-card-3");
  await expect(added).toBeVisible();
  await expect(added.getByText("Non utilisée")).toBeVisible();
  await expect(page.getByTestId("photos-summary")).toHaveText(/^3 \/ 100 photos/);
  // Shrunk in the browser to three sizes. The fixture is 1920 px wide, so its
  // largest size keeps that width and the other two halve it.
  const thumbnail = added.locator("img");
  const src = await thumbnail.getAttribute("src");
  // Each size is served at the digest of its own bytes: three distinct URLs,
  // the largest one the photo's own.
  expect(src).toMatch(/^\/api\/v1\/images\/[0-9a-f]{64}\.jpg$/);
  const srcset = (await thumbnail.getAttribute("srcset")) ?? "";
  const entries = srcset.split(", ").map((entry) => entry.split(" "));
  expect(entries.map(([, width]) => width)).toEqual(["480w", "960w", "1920w"]);
  expect(entries[2]?.[0]).toBe(src);
  expect(new Set(entries.map(([url]) => url)).size).toBe(3);
  // The mock stores the sizes it was sent, so all three came in one request.
  expect(uploads).toHaveLength(1);

  // The mock's state lives in page memory, so the spec reaches /band by
  // clicking the nav, not page.goto. The URL changes before the router has
  // swapped the page, so wait for the library to go before reading /band.
  await page.locator('a[href="/band"]:visible').first().click();
  await expect(page).toHaveURL(/\/band$/);
  await expect(page.getByTestId("photos-summary")).toBeHidden();

  // Cloches has no photo in the mock: its empty frame is the add button.
  const bells = page.getByRole("article", { name: "Cloches" });
  await expect(bells.locator('[data-photo-pending="register-4"]')).toBeVisible();
  await bells.getByRole("button", { name: "Ajouter une photo — Cloches" }).click();
  // A picker tile is named by the photo's name: the file name, less ".jpg".
  await page.getByRole("dialog").getByRole("button", { name: "sample-photo" }).click();

  const placed = bells.locator(`img[src="${src}"]`);
  await expect(placed).toBeVisible();
  await expect(placed).toHaveAttribute("alt", "Cloches");
  await expect(placed).toHaveAttribute("srcset", /480w, .*960w, .*1920w$/);
  await expect(bells.locator("[data-photo-pending]")).toHaveCount(0);
});

/** The stored sizes the photo's page lists, largest first, as "W × H". */
async function storedSizes(page: Page): Promise<string[]> {
  const items = await page.getByTestId("photo-sizes").getByRole("listitem").allTextContents();
  return items.map((text) => text.replace(/ px · .*$/, ""));
}

test("a photo is renamed, turned and replaced on its own page, and /band shows the result", async ({
  page,
}) => {
  await logIn(page, "demo.direction");
  await page.goto("/media");
  await expect(page.getByTestId("photos-summary")).toHaveText(/^2 \/ 100 photos/);
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Ajouter des photos" }).click();
  await (await chooser).setFiles(PHOTO);
  const card = page.getByTestId("library-card-3");
  await expect(card).toBeVisible();

  // Placed on /band first, so the replacement has a page to show up on.
  await page.locator('a[href="/band"]:visible').first().click();
  const bells = page.getByRole("article", { name: "Cloches" });
  await bells.getByRole("button", { name: "Ajouter une photo — Cloches" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "sample-photo" }).click();
  await expect(bells.locator('img[src^="/api/v1/images/"]')).toBeVisible();
  // The library sits behind the account menu; the router is told directly,
  // which keeps the mock's library in page memory, as a click would.
  await page.evaluate(() => {
    window.history.pushState({}, "", "/media");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });

  // The card's name opens the photo's page.
  await page.getByTestId("library-card-3").getByRole("link", { name: "sample-photo" }).click();
  await expect(page).toHaveURL(/\/media\/3$/);
  await expect(page.getByRole("heading", { level: 1, name: "sample-photo" })).toBeVisible();
  expect(await storedSizes(page)).toEqual(["1920 × 1275", "960 × 638", "480 × 319"]);

  // Rename.
  await page.getByRole("button", { name: "Renommer" }).click();
  await page.getByLabel("Nom").fill("Parrains et marraines");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Parrains et marraines" }),
  ).toBeVisible();

  // Turn a quarter: through a real canvas, the largest stored size swaps its
  // sides, and every smaller size follows.
  await page.getByRole("button", { name: "Tourner à droite" }).click();
  await expect(page.getByText("Photo tournée.")).toBeVisible();
  expect(await storedSizes(page)).toEqual(["1275 × 1920", "638 × 960", "319 × 480"]);
  const turned = await page.getByRole("img", { name: "Parrains et marraines" }).getAttribute("src");
  expect(turned).toMatch(/^\/api\/v1\/images\/[0-9a-f]{64}\.jpg$/);

  // Replace with another photo, made here on a canvas so it is a real JPEG.
  const other = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 900;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no 2d context");
    context.fillStyle = "#2a6";
    context.fillRect(0, 0, 1200, 900);
    context.fillStyle = "#fff";
    context.fillRect(100, 100, 400, 300);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no blob"))), "image/jpeg", 0.9),
    );
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
  });
  const replaceChooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Remplacer" }).click();
  await (
    await replaceChooser
  ).setFiles({ name: "vert.jpg", mimeType: "image/jpeg", buffer: Buffer.from(other, "base64") });
  await expect(page.getByText("Photo remplacée.")).toBeVisible();
  expect(await storedSizes(page)).toEqual(["1200 × 900", "960 × 720", "480 × 360"]);
  // The name stays: a replacement changes the photo, not its label.
  await expect(
    page.getByRole("heading", { level: 1, name: "Parrains et marraines" }),
  ).toBeVisible();
  const replaced = await page
    .getByRole("img", { name: "Parrains et marraines" })
    .getAttribute("src");
  expect(replaced).not.toBe(turned);

  // /band shows the new photo where the old one was placed.
  await page.locator('a[href="/band"]:visible').first().click();
  const shown = page.getByRole("article", { name: "Cloches" }).locator("img");
  await expect(shown).toHaveAttribute("src", replaced ?? "");
  await expect(shown).toHaveAttribute("alt", "Cloches");
  // It loads: the srcset names the replacement's sizes, which the mock serves.
  await expect
    .poll(() => shown.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
    .toBe(true);
});

test("a photo's page fits a phone, and each action is a 44px target", async ({ page }) => {
  await logIn(page, "demo.direction");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/media/1");
  await expect(
    page.getByRole("heading", { level: 1, name: "Le groupe au Carnaval 2026" }),
  ).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
  const group = page.getByRole("group", { name: "Actions sur la photo" });
  for (const action of await group.locator("button, a").all()) {
    const box = await action.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
});

test("the media screen fits a phone without scrolling sideways", async ({ page }) => {
  await logIn(page, "demo.direction");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/media");
  await expect(page.getByTestId("library-card-1")).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});

test("a photo dropped on an empty slot is shrunk, uploaded and placed there", async ({ page }) => {
  await logIn(page, "demo.direction");
  await page.locator('a[href="/band"]:visible').first().click();
  const bells = page.getByRole("article", { name: "Cloches" });
  const frame = bells.locator('[data-photo-pending="register-4"]');
  await expect(frame).toBeVisible();

  // A real DataTransfer carrying a real JPEG, so the canvas shrink and the
  // multipart body run as they do for a file dragged from the desktop.
  const bytes = readFileSync(PHOTO).toString("base64");
  const dataTransfer = await page.evaluateHandle((base64) => {
    const binary = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([binary], "sample-photo.jpg", { type: "image/jpeg" }));
    return transfer;
  }, bytes);
  await frame.dispatchEvent("dragenter", { dataTransfer });
  await expect(bells.getByText("Déposer pour ajouter")).toBeVisible();
  await frame.dispatchEvent("drop", { dataTransfer });

  const placed = bells.locator('img[src^="/api/v1/images/"]');
  await expect(placed).toBeVisible();
  await expect(placed).toHaveAttribute("alt", "Cloches");
  await expect(bells.locator("[data-photo-pending]")).toHaveCount(0);
});

test("a slot's controls are 44px targets and an empty frame is 3:2 on a phone", async ({
  page,
}) => {
  // Logged in at the default size, where the account button is in the bar.
  await logIn(page, "demo.direction");
  await page.locator('a[href="/band"]:visible').first().click();
  await page.setViewportSize({ width: 390, height: 844 });

  const add = page
    .getByRole("article", { name: "Cloches" })
    .getByRole("button", { name: "Ajouter une photo — Cloches" });
  const pencil = page
    .getByRole("article", { name: "Trompettes" })
    .getByRole("button", { name: "Changer la photo — Trompettes" });
  await expect(add).toBeVisible();
  await expect(pencil).toBeVisible();

  for (const control of [add, pencil]) {
    const box = await control.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  const frame = await add.boundingBox();
  expect(Math.abs((frame?.height ?? 0) - ((frame?.width ?? 0) * 2) / 3)).toBeLessThanOrEqual(2);

  // A visitor's empty frame has the same shape. The mock's session lives in
  // page memory, so a reload is a visitor.
  await page.goto("/band");
  await expect(page.getByRole("button", { name: /^Ajouter une photo/ })).toHaveCount(0);
  const pending = page.getByRole("article", { name: "Cloches" }).locator("[data-photo-pending]");
  await expect(pending).toBeVisible();
  const quiet = await pending.boundingBox();
  expect(Math.abs((quiet?.height ?? 0) - ((quiet?.width ?? 0) * 2) / 3)).toBeLessThanOrEqual(2);
  expect(quiet?.width).toBe(frame?.width);
});
