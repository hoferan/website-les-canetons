import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

import { expectNoA11yViolations } from "../../internal/testing/axe";
import { ToastCard } from "./toast-card";

/**
 * The card on its own, with no clock running (`frozenAt`). The clock and the
 * stack are in toast.test.tsx, which runs on fake timers that axe cannot.
 */
test.each(["success", "info", "warning", "error"] as const)(
  "a %s card, with an action, has no axe violations",
  async (level) => {
    const { container } = render(
      <ToastCard
        level={level}
        message="Texte enregistré."
        action={{ label: "Annuler", onClick: () => undefined }}
        closeLabel="Fermer"
        frozenAt={0.5}
        onClose={() => undefined}
      />,
    );
    await expectNoA11yViolations(container);
  },
);

test("the close button is named by closeLabel, so the app can translate it", async () => {
  const onClose = vi.fn();
  render(
    <ToastCard
      level="error"
      message="Speichern fehlgeschlagen."
      closeLabel="Schliessen"
      onClose={onClose}
    />,
  );

  await userEvent.click(screen.getByRole("button", { name: "Schliessen" }));
  expect(onClose).toHaveBeenCalledTimes(1);
});
