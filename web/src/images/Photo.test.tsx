import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test } from "vitest";

import { setLocale } from "../i18n";
import { altFor, Photo, PHOTO_SIZES } from "./Photo";

const base = {
  url: "/api/v1/images/cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc.jpg",
  width: 1600,
  height: 1067,
  srcset:
    "/api/v1/images/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg 480w, /api/v1/images/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.jpg 960w, /api/v1/images/cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc.jpg 1600w",
  altFr: null,
  altDe: null,
};

beforeEach(async () => {
  await setLocale("fr");
});

test("a French page with only a German alt text shows the German one", () => {
  expect(altFor({ altFr: null, altDe: "Die Trompeten" }, "Photo")).toBe("Die Trompeten");
});

test("a German page prefers its own alt text and falls back to French", async () => {
  await setLocale("de-CH");
  expect(altFor({ altFr: "Les trompettes", altDe: "Die Trompeten" }, "Foto")).toBe("Die Trompeten");
  expect(altFor({ altFr: "Les trompettes", altDe: null }, "Foto")).toBe("Les trompettes");
});

test("with no alt text in either language the fallback is used, blanks included", () => {
  expect(altFor({ altFr: null, altDe: null }, "Photo du registre Cloches")).toBe(
    "Photo du registre Cloches",
  );
  expect(altFor({ altFr: "  ", altDe: "" }, "Photo du registre Cloches")).toBe(
    "Photo du registre Cloches",
  );
});

test("the image reserves its box, loads lazily and offers every size", () => {
  render(<Photo photo={base} fallbackAlt="Les Canetons" sizes={PHOTO_SIZES.textColumn} />);
  const img = screen.getByRole("img", { name: "Les Canetons" });
  expect(img).toHaveAttribute("src", base.url);
  expect(img).toHaveAttribute("srcset", base.srcset);
  expect(img).toHaveAttribute("sizes", "(min-width: 704px) 672px, calc(100vw - 32px)");
  expect(img).toHaveAttribute("width", "1600");
  expect(img).toHaveAttribute("height", "1067");
  expect(img).toHaveAttribute("loading", "lazy");
  expect(img).toHaveAttribute("decoding", "async");
});
