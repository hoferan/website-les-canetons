import { afterEach, expect, test } from "vitest";

import { fadeAround, shadowOffset } from "./fadeAround";

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

afterEach(() => {
  document.body.innerHTML = "";
});

test("a card's hard shadow is read from its computed box-shadow", () => {
  expect(shadowOffset("rgb(20, 18, 28) 6px 6px 0px 0px")).toEqual({ x: 6, y: 6 });
});

test("only the first of several shadows counts", () => {
  expect(
    shadowOffset("rgba(0, 0, 0, 0.1) 4px 8px 0px 0px, rgb(0, 0, 0) 12px 12px 0px 0px"),
  ).toEqual({ x: 4, y: 8 });
});

test("no shadow, or an inset one, takes no room outside the block", () => {
  expect(shadowOffset("none")).toEqual({ x: 0, y: 0 });
  expect(shadowOffset("rgb(0, 0, 0) 3px 5px 0px 0px inset")).toEqual({ x: 0, y: 0 });
});

test("the fade is laid outside the page and taken away again", () => {
  const block = document.createElement("section");
  document.body.appendChild(block);

  const unfade = fadeAround(
    () => block,
    () => false,
  );
  expect(document.querySelectorAll("body > [data-edit-fade]")).toHaveLength(1);

  unfade();
  expect(document.querySelector("[data-edit-fade]")).toBeNull();
});

/** A block with a scalloped edge, drawn as Scallop draws it. */
function scallopedBlock(): HTMLElement {
  const block = document.createElement("footer");
  block.innerHTML = `<svg data-scallop class="absolute" height="23">
    <defs><pattern id="scallop-a"><path style="fill: rgb(255, 210, 63)"></path></pattern></defs>
    <rect fill="url(#scallop-a)"></rect>
  </svg>`;
  return block;
}

test("a scalloped edge gets a copy whose bumps are the fade", () => {
  const block = scallopedBlock();
  document.body.appendChild(block);

  fadeAround(
    () => block,
    () => false,
  );

  const copy = document.querySelector<SVGSVGElement>("[data-edit-fade] svg[data-scallop]")!;
  expect(copy).not.toBeNull();
  // Its own pattern: url(#id) would otherwise paint with the original's colour.
  const id = copy.querySelector("pattern")!.id;
  expect(id).not.toBe("scallop-a");
  expect(copy.querySelector("rect")!.getAttribute("fill")).toBe(`url(#${id})`);
  expect(copy.querySelector("path")!.style.fill).toBe("var(--edit-fade)");
});

test("the fade follows the block when the page renders it anew", async () => {
  // A card that is a link becomes another element once its chips go.
  const first = scallopedBlock();
  document.body.appendChild(first);
  let current: HTMLElement = first;
  fadeAround(
    () => current,
    () => false,
  );
  expect(document.querySelector("[data-edit-fade] svg")).not.toBeNull();

  const second = document.createElement("article");
  first.replaceWith(second);
  current = second;
  await nextFrame();

  // The first block's edge went with it.
  expect(document.querySelector("[data-edit-fade] svg")).toBeNull();
});

test("a block that is not on the page yet is picked up once it is", async () => {
  // A new card appears only once its editor has put it on the page.
  let current: HTMLElement | null = null;
  fadeAround(
    () => current,
    () => false,
  );
  expect(document.querySelector("[data-edit-fade] svg")).toBeNull();

  current = scallopedBlock();
  document.body.appendChild(current);
  await nextFrame();

  expect(document.querySelector("[data-edit-fade] svg[data-scallop]")).not.toBeNull();
});

test("an edge's copy covers only the part inside the block, or that part fades twice", () => {
  // The footer's edge reaches a pixel above the footer to close a hairline.
  // That pixel is outside the hole and already faded with the page.
  const block = scallopedBlock();
  document.body.appendChild(block);
  const rect = (top: number, height: number) =>
    ({ top, bottom: top + height, left: 0, right: 400, width: 400, height }) as DOMRect;
  block.getBoundingClientRect = () => rect(100, 300);
  block.querySelector("svg")!.getBoundingClientRect = () => rect(99, 23);

  fadeAround(
    () => block,
    () => false,
  );

  const copy = document.querySelector<SVGSVGElement>("[data-edit-fade] svg[data-scallop]")!;
  expect(copy.style.clipPath).toBe("inset(1px 0px 0px)");
});
