import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, test, vi } from "vitest";

import type { ImageResource } from "../api/generated/model";
import { setMockUser } from "../mocks/handlers";
import { renderWithSession } from "../test/renderWithSession";
import { PhotoField } from "./PhotoField";
import { PhotoPicker } from "./PhotoPicker";

const NAMES: Record<number, string> = {
  1: "Le groupe au Carnaval 2026",
  2: "Trompettes en répétition",
};
const pick = (id: number) => screen.findByRole("button", { name: NAMES[id] });

test("the picker lists the library newest first and hands back the picked image", async () => {
  setMockUser("demo.direction");
  const onPick = vi.fn<(image: ImageResource) => void>();
  const onOpenChange = vi.fn();
  await renderWithSession(<PhotoPicker open onOpenChange={onOpenChange} onPick={onPick} />);

  const grid = await screen.findByTestId("photo-picker-grid");
  // Each tile is named by the photo's name, which it shows: no aria-label
  // hides a number behind it.
  const tiles = within(grid).getAllByRole("button");
  expect(tiles.map((tile) => tile.getAttribute("aria-label"))).toEqual([null, null]);
  expect(tiles.map((tile) => tile.textContent)).toEqual([NAMES[2], NAMES[1]]);
  expect(tiles[0]).toHaveAccessibleName(NAMES[2]);

  await userEvent.setup().click(await pick(1));
  expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 1, width: 1600 }));
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

test("a photo added in the picker can be picked once the library lists it", async () => {
  setMockUser("demo.direction");
  const user = userEvent.setup();
  const onPick = vi.fn<(image: ImageResource) => void>();
  // The real multipart path cannot run in jsdom; a duplicate answer for an
  // image the mock library already holds stands in for a finished upload.
  const upload = vi.fn(async () => ({ status: 200 as const, id: 2 }));
  const shrinker = vi.fn(async (file: File) => [file]);
  await renderWithSession(
    <PhotoPicker
      open
      onOpenChange={() => {}}
      onPick={onPick}
      upload={upload}
      shrinker={shrinker}
    />,
  );
  await pick(2);

  const input = screen.getByTestId("photo-picker-input");
  expect(input).toHaveAttribute("multiple");
  expect(input).toHaveAttribute("accept", "image/*");
  await user.upload(input, new File(["x"], "one.jpg", { type: "image/jpeg" }));

  await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
  // Settled and listed: no status card is left beside the tile.
  await waitFor(() => expect(screen.queryByTestId("photo-picker-cards")).toBeNull());
  await user.click(await pick(2));
  expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }));
});

function Harness() {
  const [photo, setPhoto] = useState<Parameters<typeof PhotoField>[0]["value"]>({
    url: "/api/v1/images/dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd.jpg",
    width: 800,
    height: 1000,
    srcset:
      "/api/v1/images/dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd.jpg 800w",
    altFr: null,
    altDe: null,
  });
  return <PhotoField label="Photo" value={photo} onChange={(_id, next) => setPhoto(next)} />;
}

test("without images.manage the field shows the thumbnail and no controls", async () => {
  setMockUser("demo.player");
  await renderWithSession(<Harness />);
  expect(await screen.findByRole("img", { name: "Photo" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Choisir" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Retirer" })).toBeNull();
});

test("without images.manage and without a photo the field renders nothing", async () => {
  setMockUser("demo.player");
  await renderWithSession(<PhotoField label="Photo" value={null} onChange={() => {}} />);
  expect(screen.queryByTestId("photo-field")).toBeNull();
});

test("with images.manage the field picks a library image and shows it, then removes it", async () => {
  setMockUser("demo.direction");
  const user = userEvent.setup();
  const onChange = vi.fn();
  function Wrapper() {
    const [photo, setPhoto] = useState<Parameters<typeof PhotoField>[0]["value"]>(null);
    return (
      <PhotoField
        label="Photo"
        value={photo}
        onChange={(id, next) => {
          onChange(id);
          setPhoto(next);
        }}
      />
    );
  }
  await renderWithSession(<Wrapper />);
  expect(screen.queryByRole("button", { name: "Retirer" })).toBeNull();

  await user.click(await screen.findByRole("button", { name: "Choisir" }));
  await user.click(await pick(2));
  expect(onChange).toHaveBeenLastCalledWith(2);
  expect(await screen.findByRole("img", { name: "Photo" })).toHaveAttribute(
    "src",
    // The mock names a seeded size by its width, then the photo id.
    expect.stringContaining(`${"1280".padStart(8, "0")}${"2".padStart(56, "0")}.jpg`),
  );

  await user.click(screen.getByRole("button", { name: "Retirer" }));
  expect(onChange).toHaveBeenLastCalledWith(null);
  expect(screen.queryByRole("img", { name: "Photo" })).toBeNull();
});
