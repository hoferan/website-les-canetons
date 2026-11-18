import { render, screen } from "@testing-library/react";
import { AlertTriangle } from "lucide-react";
import { describe, expect, test } from "vitest";

import { expectNoA11yViolations } from "../../internal/testing/axe";
import { Badge } from "./badge";

describe("Badge", () => {
  test("is a span with its text and no role, forwarding native attributes", () => {
    render(
      <Badge data-testid="draft" aria-label="Événement en brouillon">
        Brouillon
      </Badge>,
    );
    const badge = screen.getByTestId("draft");
    expect(badge.tagName).toBe("SPAN");
    expect(badge).toHaveTextContent("Brouillon");
    expect(badge).not.toHaveAttribute("role");
    expect(badge).toHaveAttribute("data-slot", "badge");
    expect(badge).toHaveAttribute("aria-label", "Événement en brouillon");
  });

  test("defaults to a neutral md badge", () => {
    render(<Badge>Public</Badge>);
    const badge = screen.getByText("Public");
    expect(badge).toHaveAttribute("data-tone", "neutral");
    expect(badge).toHaveClass("text-sm", "font-medium", "bg-status-neutral", "text-content");
  });

  // jsdom has no layout, so this pins the classes; web/e2e/badges.spec.ts
  // measures the rendered pills.
  test("each size has one type spec and every tone one border width", () => {
    render(
      <>
        <Badge size="sm">Petit</Badge>
        <Badge size="md">Moyen</Badge>
        <Badge tone="tag" tint="teal">
          Concert
        </Badge>
      </>,
    );
    expect(screen.getByText("Petit")).toHaveClass("text-xs", "font-semibold");
    expect(screen.getByText("Moyen")).toHaveClass("text-sm", "font-medium");
    for (const text of ["Petit", "Moyen", "Concert"]) {
      expect(screen.getByText(text)).toHaveClass("border", "rounded-pill", "whitespace-nowrap");
    }
  });

  test.each([
    ["attention", "bg-status-attention", "text-content"],
    ["success", "bg-status-success", "text-content"],
    ["danger", "bg-status-danger", "text-content-on-status-danger"],
  ] as const)("the %s tone wears its status fill", (tone, fill, text) => {
    render(<Badge tone={tone}>Statut</Badge>);
    expect(screen.getByText("Statut")).toHaveClass(fill, text);
  });

  test("a tag wears its tint pair and a transparent border", () => {
    render(
      <Badge tone="tag" tint="amber">
        Sortie
      </Badge>,
    );
    const badge = screen.getByText("Sortie");
    expect(badge).toHaveClass("bg-tag-amber", "text-tag-amber-ink", "border-transparent");
  });

  test("hides its icon from assistive technology", () => {
    render(
      <Badge tone="attention" icon={<AlertTriangle data-testid="icon" />}>
        Provisoire
      </Badge>,
    );
    expect(screen.getByTestId("icon").parentElement).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("Provisoire")).toHaveTextContent(/^Provisoire$/);
  });

  test("a caller's class wins over the primitive's", () => {
    render(<Badge className="self-start px-3">Inutilisée</Badge>);
    const badge = screen.getByText("Inutilisée");
    expect(badge).toHaveClass("self-start", "px-3");
    expect(badge).not.toHaveClass("px-2");
  });

  test("badges of every tone have no structural accessibility violations", async () => {
    const { container } = render(
      <p>
        <Badge>Public</Badge>
        <Badge tone="tag" tint="violet">
          Répétition
        </Badge>
        <Badge tone="attention" size="sm" icon={<AlertTriangle />}>
          Jamais utilisé
        </Badge>
        <Badge tone="success" size="sm">
          Payé
        </Badge>
        <Badge tone="danger" size="sm">
          Suspecte
        </Badge>
      </p>,
    );
    await expectNoA11yViolations(container);
  });
});
