import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { expectNoA11yViolations } from "../../internal/testing/axe";
import { Surface } from "./surface";

describe("Surface", () => {
  test("defaults to a list div with medium padding, forwarding native attributes", () => {
    render(
      <Surface data-testid="card" aria-label="Carte">
        Contenu
      </Surface>,
    );
    const surface = screen.getByTestId("card");
    expect(surface.tagName).toBe("DIV");
    expect(surface).toHaveAttribute("data-slot", "surface");
    expect(surface).toHaveAttribute("data-variant", "list");
    expect(surface).toHaveAttribute("aria-label", "Carte");
    expect(surface).toHaveClass("rounded-surface", "border-2", "p-4");
    expect(surface).toHaveTextContent("Contenu");
  });

  test.each(["div", "article", "li", "section", "form"] as const)(
    "renders as a <%s>, so its semantics survive",
    (as) => {
      const { container } = render(
        <ul>
          <Surface as={as} data-testid="surface">
            x
          </Surface>
        </ul>,
      );
      expect(screen.getByTestId("surface").tagName).toBe(as.toUpperCase());
      expect(container.querySelectorAll("[data-slot=surface]")).toHaveLength(1);
    },
  );

  // jsdom has no layout, so this pins the classes; web/e2e/surfaces.spec.ts
  // measures the rendered panels.
  test.each([
    ["list", ["border-2", "border-surface-edge", "bg-surface"], ["shadow-raised", "border-dashed"]],
    ["feature", ["border-3", "shadow-raised", "bg-surface"], ["border-dashed"]],
    ["form", ["border-3", "shadow-raised-sm", "bg-surface"], ["shadow-raised"]],
    [
      "placeholder",
      ["border-2", "border-dashed", "border-surface-placeholder-edge"],
      ["bg-surface", "shadow-raised", "shadow-raised-sm"],
    ],
  ] as const)("the %s variant draws its edge and depth", (variant, has, lacks) => {
    render(
      <Surface variant={variant} data-testid="surface">
        x
      </Surface>,
    );
    const surface = screen.getByTestId("surface");
    expect(surface).toHaveClass("rounded-surface", ...has);
    for (const name of lacks) expect(surface).not.toHaveClass(name);
  });

  test("every variant shares the one radius", () => {
    render(
      <>
        {(["list", "feature", "form", "placeholder"] as const).map((variant) => (
          <Surface key={variant} variant={variant} data-testid={variant}>
            x
          </Surface>
        ))}
      </>,
    );
    for (const variant of ["list", "feature", "form", "placeholder"]) {
      expect(screen.getByTestId(variant).className.match(/\brounded-\S+/g)).toEqual([
        "rounded-surface",
      ]);
    }
  });

  test("padding lg and a tilt either way", () => {
    render(
      <>
        <Surface padding="lg" tilt="left" data-testid="left">
          x
        </Surface>
        <Surface tilt="right" data-testid="right">
          x
        </Surface>
      </>,
    );
    expect(screen.getByTestId("left")).toHaveClass("p-5", "-rotate-[1.2deg]");
    expect(screen.getByTestId("right")).toHaveClass("p-4", "rotate-1");
  });

  test("an interactive surface is its one link, with the focus ring and the hover lift", () => {
    render(
      <ul>
        <li>
          <Surface asChild interactive variant="feature">
            <a href="/rejoindre">
              <h3>Nous rejoindre</h3>
              <p>Les instruments recherchés.</p>
            </a>
          </Surface>
        </li>
      </ul>,
    );
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("data-slot", "surface");
    expect(link).toHaveClass("focus-ring", "hover:-translate-y-0.5", "border-3", "shadow-raised");
    expect(link).toHaveAccessibleName("Nous rejoindre Les instruments recherchés.");
  });

  test("a caller's class wins over the primitive's", () => {
    render(
      <Surface data-testid="draft" className="border-dashed p-3">
        x
      </Surface>,
    );
    const surface = screen.getByTestId("draft");
    expect(surface).toHaveClass("border-dashed", "p-3");
    expect(surface).not.toHaveClass("p-4");
  });

  test("surfaces of every variant have no structural accessibility violations", async () => {
    const { container } = render(
      <main>
        <ul>
          <Surface as="li">Répétition</Surface>
        </ul>
        <Surface as="article" variant="feature" tilt="left">
          <h2>Le comité</h2>
        </Surface>
        <Surface as="form" variant="form" padding="lg" aria-label="Contact">
          <label>
            Nom <input />
          </label>
        </Surface>
        <Surface as="section" variant="placeholder" aria-label="Nouveau rôle">
          <h2>Nouveau rôle</h2>
        </Surface>
        <Surface asChild interactive variant="feature">
          <a href="/comite">Le comité</a>
        </Surface>
      </main>,
    );
    await expectNoA11yViolations(container);
  });
});
