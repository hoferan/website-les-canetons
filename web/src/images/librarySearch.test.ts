import { describe, expect, it } from "vitest";

import { matchesName, sortImages, type LibraryOrder } from "./librarySearch";

describe("matchesName", () => {
  it("matches any part of the name, ignoring case and accents", () => {
    expect(matchesName("Répétition du jeudi", "repet")).toBe(true);
    expect(matchesName("Répétition du jeudi", "JEUDI")).toBe(true);
    expect(matchesName("Fête des Rois", "fete")).toBe(true);
    expect(matchesName("Grosses-caisses à Morat", "a morat")).toBe(true);
    expect(matchesName("Répétition du jeudi", "vendredi")).toBe(false);
  });

  it("matches everything when the query is blank", () => {
    expect(matchesName("Photo", "")).toBe(true);
    expect(matchesName("Photo", "   ")).toBe(true);
  });

  it("trims the query, as somebody pasting a name would expect", () => {
    expect(matchesName("Carnaval 2026", "  carnaval ")).toBe(true);
  });
});

describe("sortImages", () => {
  const images = [
    { id: 1, name: "Zèbre", createdAt: "2026-09-26T10:00:00+00:00", bytes: 300 },
    { id: 2, name: "éclair", createdAt: "2026-09-28T10:00:00+00:00", bytes: 900 },
    { id: 3, name: "Photo 10", createdAt: "2026-09-27T10:00:00+00:00", bytes: 500 },
    { id: 4, name: "Photo 9", createdAt: "2026-09-27T10:00:00+00:00", bytes: 500 },
  ];
  const ids = (order: LibraryOrder) => sortImages(images, order, "fr").map((image) => image.id);

  it("puts the newest first, and the higher id first on the same instant, as the API does", () => {
    expect(ids("newest")).toEqual([2, 4, 3, 1]);
  });

  it("puts the oldest first", () => {
    expect(ids("oldest")).toEqual([1, 3, 4, 2]);
  });

  it("sorts names as a reader would: accents with their letter, numbers by value", () => {
    expect(ids("name")).toEqual([2, 4, 3, 1]);
  });

  it("puts the heaviest first, newest first among equals", () => {
    expect(ids("largest")).toEqual([2, 4, 3, 1]);
  });

  it("leaves the list it was given alone", () => {
    const before = images.map((image) => image.id);
    sortImages(images, "oldest", "fr");
    expect(images.map((image) => image.id)).toEqual(before);
  });
});
