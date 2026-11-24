import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

import { expectNoA11yViolations } from "../../internal/testing/axe";
import { StateMessage } from "./state-message";

const retry = (onRetry = vi.fn(), busy = false) => ({ label: "Réessayer", onRetry, busy });

test("loading says so politely and draws the rows it stands in for", () => {
  render(<StateMessage state="loading" label="Chargement…" rows={2} rowHeight={15.5} />);

  expect(screen.getByRole("status")).toHaveTextContent("Chargement…");
  const rows = document.querySelectorAll("[data-skeleton-row]");
  expect(rows).toHaveLength(2);
  expect(rows[0]).toHaveStyle({ height: "15.5rem" });
  expect(rows[0]?.closest("[aria-hidden='true']")).not.toBeNull();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("three rows unless told otherwise", () => {
  render(<StateMessage state="loading" label="Chargement…" />);

  expect(document.querySelectorAll("[data-skeleton-row]")).toHaveLength(3);
});

test("an error is an alert with a retry that calls the caller", async () => {
  const onRetry = vi.fn();
  render(
    <StateMessage
      state="error"
      title="Le planning n’a pas pu être chargé."
      description="Vérifiez la connexion, puis réessayez."
      retry={retry(onRetry)}
    />,
  );

  expect(screen.getByRole("alert")).toHaveTextContent(
    "Le planning n’a pas pu être chargé.Vérifiez la connexion, puis réessayez.",
  );
  await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
  expect(onRetry).toHaveBeenCalledOnce();
});

test("an error wears the notice's error level, the field-error red", () => {
  render(<StateMessage state="error" title="Échec." retry={retry()} />);

  expect(document.querySelector("[data-notice-level]")).toHaveAttribute(
    "data-notice-level",
    "error",
  );
  expect(document.querySelector("[data-notice-column]")).toHaveClass("bg-danger");
});

test("an error arriving takes nobody's focus", () => {
  render(<StateMessage state="error" title="Échec." retry={retry()} />);

  expect(document.body).toHaveFocus();
});

/**
 * React Query keeps the error status while a retry is in flight, so the error
 * stays on screen and the button never unmounts: the focus a click put on it
 * stays there, and a second failure finds the reader on Réessayer.
 */
test("a retry in flight keeps the button, its focus, and ignores more clicks", async () => {
  const onRetry = vi.fn();
  const { rerender } = render(<StateMessage state="error" title="Échec." retry={retry(onRetry)} />);
  const button = screen.getByRole("button", { name: "Réessayer" });
  await userEvent.click(button);

  rerender(<StateMessage state="error" title="Échec." retry={retry(onRetry, true)} />);
  expect(button).toHaveAttribute("aria-busy", "true");
  await userEvent.click(button);
  expect(onRetry).toHaveBeenCalledOnce();

  rerender(<StateMessage state="error" title="Échec." retry={retry(onRetry, false)} />);
  expect(screen.getByRole("button", { name: "Réessayer" })).toBe(button);
  expect(button).toHaveFocus();
});

/**
 * A live region announces what is added to it. The same words left in place
 * after a second failure would say nothing, so they are put back in.
 */
test("a second failure puts the message back into the alert, so it is heard again", () => {
  const { rerender } = render(<StateMessage state="error" title="Échec." retry={retry()} />);
  const alert = screen.getByRole("alert");
  const first = alert.firstElementChild;

  rerender(<StateMessage state="error" title="Échec." retry={retry(vi.fn(), true)} />);
  rerender(<StateMessage state="error" title="Échec." retry={retry(vi.fn(), false)} />);

  expect(screen.getByRole("alert")).toBe(alert);
  expect(alert.firstElementChild).not.toBe(first);
  expect(alert).toHaveTextContent("Échec.");
});

/** The status region exists before loading starts again, so it is heard. */
test("the status region outlives the state it announced", () => {
  const { rerender } = render(<StateMessage state="error" title="Échec." retry={retry()} />);
  const status = screen.getByRole("status");
  expect(status).toBeEmptyDOMElement();

  rerender(<StateMessage state="loading" label="Chargement…" />);

  expect(screen.getByRole("status")).toBe(status);
  expect(status).toHaveTextContent("Chargement…");
});

test("empty says what is missing and offers the caller's next step", () => {
  render(
    <StateMessage
      state="empty"
      title="Aucun événement au planning."
      description="Ajoutez une série pour commencer."
      action={<a href="/events/new/series">Ajouter une série</a>}
    />,
  );

  expect(screen.getByText("Aucun événement au planning.")).toBeInTheDocument();
  expect(screen.getByText("Ajoutez une série pour commencer.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Ajouter une série" })).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("empty needs no action", () => {
  render(<StateMessage state="empty" title="Aucun événement passé." />);

  expect(screen.getByText("Aucun événement passé.")).toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

test("takes a caller's spacing", () => {
  render(<StateMessage state="empty" title="Rien." className="mt-block" />);

  expect(document.querySelector("[data-state-message]")).toHaveClass("mt-block");
});

test("has no accessibility violations in any state", async () => {
  const { container } = render(
    <>
      <StateMessage state="loading" label="Chargement…" />
      <StateMessage
        state="empty"
        title="Aucun événement au planning."
        action={<a href="/events/new/series">Ajouter une série</a>}
      />
      <StateMessage
        state="error"
        title="Le planning n’a pas pu être chargé."
        description="Vérifiez la connexion, puis réessayez."
        retry={retry()}
      />
    </>,
  );

  await expectNoA11yViolations(container);
});
