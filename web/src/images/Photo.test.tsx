import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { Photo, PHOTO_SIZES } from "./Photo";

const base = {
  url: "/api/v1/images/cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc.jpg",
  width: 1600,
  height: 1067,
  srcset:
    "/api/v1/images/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg 480w, /api/v1/images/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.jpg 960w, /api/v1/images/cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc.jpg 1600w",
};

test("the image reserves its box, loads lazily and offers every size", () => {
  render(<Photo photo={base} alt="Les Canetons" sizes={PHOTO_SIZES.textColumn} />);
  const img = screen.getByRole("img", { name: "Les Canetons" });
  expect(img).toHaveAttribute("src", base.url);
  expect(img).toHaveAttribute("srcset", base.srcset);
  expect(img).toHaveAttribute("sizes", "(min-width: 704px) 672px, calc(100vw - 32px)");
  expect(img).toHaveAttribute("width", "1600");
  expect(img).toHaveAttribute("height", "1067");
  expect(img).toHaveAttribute("loading", "lazy");
  expect(img).toHaveAttribute("decoding", "async");
});
