import { describe, expect, it } from "vitest";

import { downloadName, MAX_NAME_LENGTH, nameFromFile } from "./photoName";

describe("downloadName", () => {
  it("adds .jpg to the name", () => {
    expect(downloadName("Carnaval 2026")).toBe("Carnaval 2026.jpg");
  });

  it("replaces every character a file system refuses, and control characters", () => {
    expect(downloadName('a/b\\c:d*e?f"g<h>i|j')).toBe("a b c d e f g h i j.jpg");
    expect(downloadName("tab\there\u0000nul")).toBe("tab here nul.jpg");
  });

  it("drops leading and trailing dots and spaces, and never answers a bare extension", () => {
    expect(downloadName(" ..secret.. ")).toBe("secret.jpg");
    expect(downloadName("../..")).toBe("Photo.jpg");
  });
});

describe("nameFromFile", () => {
  it("drops the extension", () => {
    expect(nameFromFile("IMG_2024.JPG")).toBe("IMG_2024");
    expect(nameFromFile("carnaval.2026.jpeg")).toBe("carnaval.2026");
    expect(nameFromFile("sans extension")).toBe("sans extension");
  });

  it("drops control characters and the bidirectional overrides the server refuses", () => {
    const override = String.fromCodePoint(0x202e);
    const isolate = String.fromCodePoint(0x2066);
    expect(nameFromFile(`facture${override}gpj.exe.jpg`)).toBe("facturegpj.exe");
    expect(nameFromFile(`a${isolate}b${String.fromCodePoint(7)}c.jpg`)).toBe("abc");
  });

  it("trims and collapses whitespace", () => {
    expect(nameFromFile("  Répétition \t du   jeudi .jpg")).toBe("Répétition du jeudi");
  });

  it("keeps at most 120 characters, counted as the server counts them", () => {
    const name = nameFromFile(`${"é".repeat(130)}.jpg`);
    expect(Array.from(name)).toHaveLength(MAX_NAME_LENGTH);
    // A cut that would leave a trailing space drops it as well.
    expect(nameFromFile(`${"a".repeat(119)} b.jpg`)).toBe("a".repeat(119));
  });

  it("does not cut an emoji in half", () => {
    const name = nameFromFile(`${"a".repeat(119)}🎺🎺.jpg`);
    expect(name).toBe(`${"a".repeat(119)}🎺`);
  });

  it("falls back to the localised word when nothing is left", () => {
    expect(nameFromFile(".jpg")).toBe("Photo");
    expect(nameFromFile("   ")).toBe("Photo");
    expect(nameFromFile("")).toBe("Photo");
  });
});
