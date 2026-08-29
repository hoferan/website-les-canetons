# Auth and Contact Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port `/authentification_inscription`, `/contact` and `/confirmation` from the old PHP front end to the React SPA, giving the app its first real login *and* its only way to log out.

**Architecture:** Four routes and one extraction. `Login.tsx` is one route with two states — the old login form when anonymous, a "Se déconnecter" view when not. Login succeeds by **invalidating `getAuthUserQueryKey()`**, never by reloading the document as the old JS did. The `{error, code, fields[]}` → French pattern currently living inside `EventForm` is pulled out into `useApiFormError()` and `FormField`, and `EventForm` is refactored onto them in the same task so the abstraction is proved against two consumers.

**Tech Stack:** React 19 + TypeScript, TanStack Query via orval-generated hooks, react-router-dom, Tailwind 4, Vitest + Testing Library + MSW, Playwright.

**Design:** `docs/superpowers/specs/2026-08-29-auth-and-contact-design.md`

---

## Before you start

Read `docs/continue-here.md`. The traps that matter most for this plan:

- **The double `.data` is real.** `query.data.data` — the outer is TanStack Query's, the inner is orval's `{ data, status, headers }` envelope. Never hide it behind a wrapper.
- **Narrow errors with `instanceof ApiError`.** The generated `TError` is the *declared* error model; the mutator always throws `ApiError`. This plan's `useApiFormError` is the one place that narrowing lives.
- **Never `fetch("/api/…")` directly** — CSRF priming lives in the mutator.
- **Testing Library needs the explicit `cleanup()`** in `web/src/setupTests.ts`; it is already there. Renders otherwise accumulate and the next test fails with "Found multiple elements".
- **Name any list a page renders.** The layout's nav is a list too.
- **Playwright runs on port 5174** and must stay there — the dev stack publishes an *unmocked* Vite on 5173 and `reuseExistingServer` cannot tell them apart.
- **`npm run check` does not build and does not run the Laravel suite.**

No API changes are needed anywhere in this plan, so **do not** run `npm run openapi` or `npm run generate:api`.

## File structure

| File | Responsibility |
| --- | --- |
| `web/src/api/useApiFormError.ts` | **new.** Bridges `ApiError` (http.ts) to French (i18n) for a form: narrowing, fallback, per-field lookup. Lives in `api/` because CLAUDE.md scopes that folder to "the generated client + hooks, and the http.ts mutator" — it is API-contract plumbing, not a component. |
| `web/src/components/FormField.tsx` | **new.** One labelled text control (`<input>` or `<textarea>`) plus the `aria-invalid` / `aria-describedby` / error-span wiring. |
| `web/src/lib/returnTo.ts` | **new.** `safeReturnTo()` — a pure function, tested as one. |
| `web/src/components/guards.tsx` | **modify.** Carry the attempted location on the anonymous bounce. |
| `web/src/pages/Login.tsx` | **new.** The route: anonymous form, logged-in view, logout. |
| `web/src/pages/Contact.tsx` | **new.** The contact form. |
| `web/src/pages/Confirmation.tsx` | **new.** Static success page. |
| `web/src/pages/EventForm.tsx` | **modify.** Refactored onto the two extracted pieces. Behaviour unchanged. |
| `web/src/mocks/handlers.ts` | **modify.** Hand-written `POST /api/contact`. |
| `web/src/routes.tsx` | **modify.** Three `Placeholder` entries replaced. |
| `web/e2e/planning.spec.ts` | **modify.** `login()` fills the real form. |
| `web/e2e/auth.spec.ts` | **new.** Login and logout through the UI. |

---

## Task 1: Extract `useApiFormError` and `FormField`

**Files:**
- Create: `web/src/api/useApiFormError.ts`
- Create: `web/src/components/FormField.tsx`
- Create: `web/src/components/FormField.test.tsx`
- Modify: `web/src/pages/EventForm.tsx`

**The safety net for this task is that `web/src/pages/EventForm.test.tsx` must pass completely unchanged.** If you find yourself editing an EventForm test, stop: the extraction changed behaviour, which it must not.

Keep every input `id` exactly as it is (`event-date`, `event-title`, `event-startTime`, …). `web/e2e/planning.spec.ts` selects `#event-title` and `#event-startTime` directly.

- [ ] **Step 1: Write the failing test for `FormField`**

Create `web/src/components/FormField.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { FormField } from "./FormField";

const noop = () => {};

test("renders a labelled input wired to its own id", () => {
  render(<FormField id="demo-name" label="Nom :" value="Canard" onChange={noop} />);
  const input = screen.getByLabelText("Nom :");
  expect(input).toHaveValue("Canard");
  expect(input).toHaveAttribute("id", "demo-name");
});

test("renders a textarea when asked for one", () => {
  render(<FormField id="demo-message" label="Message :" as="textarea" value="Coin" onChange={noop} />);
  expect(screen.getByLabelText("Message :").tagName).toBe("TEXTAREA");
});

// The whole reason this component exists: three attributes that must agree,
// copy-pasted per input, and silently useless if the ids drift apart.
test("a problem marks the control invalid and points it at the message", () => {
  render(
    <FormField id="demo-name" label="Nom :" value="" onChange={noop} problem="Nom est requis" />,
  );
  const input = screen.getByLabelText("Nom :");
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(input).toHaveAttribute("aria-describedby", "demo-name-error");
  expect(screen.getByText("Nom est requis")).toHaveAttribute("id", "demo-name-error");
});

test("no problem means no aria-invalid and no message", () => {
  render(<FormField id="demo-name" label="Nom :" value="" onChange={noop} />);
  const input = screen.getByLabelText("Nom :");
  expect(input).not.toHaveAttribute("aria-invalid");
  expect(input).not.toHaveAttribute("aria-describedby");
});

test("onChange receives the value, not the event", async () => {
  const seen: string[] = [];
  render(<FormField id="demo-name" label="Nom :" value="" onChange={(v) => seen.push(v)} />);
  const { default: userEvent } = await import("@testing-library/user-event");
  await userEvent.type(screen.getByLabelText("Nom :"), "ab");
  expect(seen).toEqual(["a", "b"]);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run web/src/components/FormField.test.tsx`
Expected: FAIL — `Failed to resolve import "./FormField"`.

- [ ] **Step 3: Write `FormField`**

Create `web/src/components/FormField.tsx`:

```tsx
/**
 * One labelled text control, and the three attributes that have to agree.
 *
 * `aria-invalid`, `aria-describedby` and the error span's `id` are trivially
 * correct and just as trivially copy-pasted wrong — a describedby pointing at
 * an id that does not exist announces nothing at all, and nothing in a test or
 * a browser complains. Every form in this app routes its text inputs through
 * here so that wiring is written once.
 *
 * It deliberately does NOT own the mutation, the submit handler or the page's
 * layout. It renders one field.
 *
 * Checkboxes are not handled: their value is a boolean, their label sits after
 * the control rather than before it, and there is exactly one in the whole app.
 * The event form writes that one out by hand.
 */
export function FormField({
  id,
  label,
  value,
  onChange,
  problem,
  as = "input",
  type = "text",
  required = false,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  problem?: string;
  as?: "input" | "textarea";
  type?: string;
  required?: boolean;
  autoComplete?: string;
}) {
  const errorId = `${id}-error`;
  const shared = {
    id,
    required,
    autoComplete,
    value,
    "aria-invalid": problem ? true : undefined,
    "aria-describedby": problem ? errorId : undefined,
    className: `rounded border p-1 ${problem ? "border-canetons-red" : ""}`,
  } as const;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id}>{label}</label>
      {as === "textarea" ? (
        <textarea {...shared} rows={6} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input {...shared} type={type} onChange={(event) => onChange(event.target.value)} />
      )}
      {problem ? (
        <span id={errorId} className="block text-sm text-canetons-red">
          {problem}
        </span>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run web/src/components/FormField.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write `useApiFormError`**

There is no separate unit test for this hook: every one of its branches is already exercised through `EventForm.test.tsx` (the field-error case, the alert case, the values-kept case) and, from Task 7, through `Contact.test.tsx`. A test that rendered a throwaway component to call it would restate those.

Create `web/src/api/useApiFormError.ts`:

```ts
import { useState } from "react";

import { ApiError } from "./http";
import { translateApiError, type TranslatedError } from "../i18n";

/**
 * A form's API error, in French.
 *
 * Three things every form in this app needs and gets wrong differently:
 *
 * 1. **The narrowing.** The generated hooks type `TError` as the DECLARED error
 *    models — `ValidationExceptionResponse | AuthLogin401` and so on — but what
 *    the mutator actually throws is always an `ApiError`. The declared type is
 *    not to be trusted here; `instanceof` is.
 * 2. **The fallback.** Anything that is not an `ApiError` (an HTML 502 from the
 *    shared host, a network drop) still has to say something in French, and it
 *    must not be a raw English string or an i18next key.
 * 3. **The field lookup**, so a message lands against the input it is about.
 *
 * `fallbackMessage` is per-form on purpose: "L'enregistrement a échoué" and
 * "La connexion a échoué" are not interchangeable, and a generic one would be
 * the worst of both.
 */
export function useApiFormError(fallbackMessage: string) {
  const [error, setError] = useState<TranslatedError | null>(null);

  /** Pass this straight to a mutation's `onError`. */
  const setFromThrown = (thrown: unknown) => {
    setError(
      thrown instanceof ApiError
        ? translateApiError(thrown)
        : { message: fallbackMessage, fields: [] },
    );
  };

  const clear = () => setError(null);

  const messageFor = (field: string) =>
    error?.fields.find((entry) => entry.field === field)?.message;

  return { error, setFromThrown, clear, messageFor };
}
```

- [ ] **Step 6: Refactor `EventForm` onto both**

In `web/src/pages/EventForm.tsx`, replace the imports of `ApiError` / `translateApiError` / `TranslatedError` and the local `error` state and `onError` / `messageFor` functions with the hook, and replace the `FIELDS.map` body with `FormField`.

Change the import block to:

```tsx
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { getEventIndexQueryKey, useEventStore, useEventUpdate } from "../api/generated/endpoints";
import type { EventIndex200Item, EventRequest } from "../api/generated/model";
import { useApiFormError } from "../api/useApiFormError";
import { FormField } from "../components/FormField";
```

Replace these lines:

```tsx
  const [error, setError] = useState<TranslatedError | null>(null);
```

with:

```tsx
  const { error, setFromThrown, clear, messageFor } = useApiFormError(
    "L’enregistrement a échoué. Veuillez réessayer.",
  );
```

Delete the whole `onError` function and its docblock (the narrowing it documented now lives in the hook), and replace the three remaining `setError` calls:

- in `onSuccess`, `setError(null)` becomes `clear()`;
- in `submit`, `setError(null)` becomes `clear()`;
- `onError` passed to both mutations becomes `setFromThrown`.

So the mutation wiring reads:

```tsx
  const onSuccess = () => {
    clear();
    setValues(EMPTY);
    onDone();
    void refresh();
  };

  const create = useEventStore({ mutation: { onSuccess, onError: setFromThrown } });
  const update = useEventUpdate({ mutation: { onSuccess, onError: setFromThrown } });
  const pending = create.isPending || update.isPending;

  const submit = (submitEvent: FormEvent) => {
    submitEvent.preventDefault();
    clear();
    if (editing) {
      update.mutate({ id: editing.id, data: values });
    } else {
      create.mutate({ data: values });
    }
  };
```

Delete the local `messageFor` definition — the hook supplies it.

Replace the whole `FIELDS.map(...)` block with:

```tsx
      {FIELDS.map((field) => (
        <FormField
          key={field.name}
          id={`event-${field.name}`}
          label={field.label}
          type={field.type}
          required={field.required}
          problem={messageFor(field.name)}
          value={values[field.name] ?? ""}
          onChange={(next) => setValues((previous) => ({ ...previous, [field.name]: next }))}
        />
      ))}
```

Leave everything else — the `key`-seeded `useState`, the `scrollIntoView` effect, the weekend checkbox, the buttons — exactly as it is.

- [ ] **Step 7: Verify nothing regressed**

Run: `npx vitest run web/src/pages web/src/components && npm run typecheck && npm run lint:js`
Expected: all pass. `EventForm.test.tsx` is 11 tests and **must not have been edited**.

Run: `npm run test:e2e`
Expected: 6 passed. This is what proves the `#event-title` ids survived.

- [ ] **Step 8: Commit**

```bash
git add web/src/api/useApiFormError.ts web/src/components/FormField.tsx web/src/components/FormField.test.tsx web/src/pages/EventForm.tsx
git commit -m "refactor(web): extract useApiFormError and FormField from the event form

Contact is about to be the second consumer of the {error, code, fields[]} ->
French pattern, and three more follow in the members' area and the souper.
Extracted at two consumers rather than one, with EventForm moved onto both in
the same change: an abstraction with a single caller proves nothing about its
shape. EventForm's tests are untouched, which is the point."
```

---

## Task 2: `safeReturnTo`

**Files:**
- Create: `web/src/lib/returnTo.ts`
- Create: `web/src/lib/returnTo.test.ts`

- [ ] **Step 1: Write the failing test**

Create `web/src/lib/returnTo.test.ts`:

```ts
import { expect, test } from "vitest";

import { safeReturnTo } from "./returnTo";

test("an ordinary in-app path is kept", () => {
  expect(safeReturnTo("/planning_repet")).toBe("/planning_repet");
  expect(safeReturnTo("/planning_repet?admin=true#top")).toBe("/planning_repet?admin=true#top");
});

test("the root is the fallback for anything absent", () => {
  expect(safeReturnTo(null)).toBe("/");
  expect(safeReturnTo(undefined)).toBe("/");
  expect(safeReturnTo("")).toBe("/");
  expect(safeReturnTo(42)).toBe("/");
});

// The old page needed an open-redirect guard because returnTo arrived as a URL
// in a link anyone could send. These are the shapes it defended against.
test("a protocol-relative URL is refused", () => {
  expect(safeReturnTo("//evil.com")).toBe("/");
});

test("a backslash protocol-relative URL is refused", () => {
  // Browsers normalise \ to / inside a URL, so "/\evil.com" is "//evil.com".
  expect(safeReturnTo("/\\evil.com")).toBe("/");
});

test("an absolute URL is refused", () => {
  expect(safeReturnTo("https://evil.com")).toBe("/");
  expect(safeReturnTo("http://evil.com")).toBe("/");
});

test("a javascript: URL is refused", () => {
  expect(safeReturnTo("javascript:alert(1)")).toBe("/");
});

test("a bare relative path is refused rather than guessed at", () => {
  expect(safeReturnTo("planning_repet")).toBe("/");
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run web/src/lib/returnTo.test.ts`
Expected: FAIL — `Failed to resolve import "./returnTo"`.

- [ ] **Step 3: Write the implementation**

Create `web/src/lib/returnTo.ts`:

```ts
/**
 * Normalises a post-login destination to a safe in-app path.
 *
 * The SPA passes the attempted location through router STATE, which never
 * appears in a URL and is set only by this application — so the open-redirect
 * attack the old page defended against does not arise there. This helper also
 * accepts a legacy `?returnTo=` query, though, because links carrying one are
 * already in the wild, and that one IS attacker-suppliable.
 *
 * The rule is deliberately a whitelist rather than a blacklist: the first
 * character must be `/` and the second must be neither `/` nor `\`. That admits
 * "/planning_repet" and refuses "//evil.com", "/\evil.com" (browsers normalise
 * the backslash), "https://evil.com" and "javascript:alert(1)" without any of
 * them needing to be enumerated.
 *
 * React Router's navigate() would treat a hostile value as an in-app path and
 * land on the 404 view rather than follow it off-site, so this is defence in
 * depth rather than the live hole the old page had. Keep it anyway — the next
 * caller may hand the value to `location`.
 */
export function safeReturnTo(raw: unknown): string {
  if (typeof raw !== "string") return "/";
  if (raw[0] !== "/") return "/";
  if (raw[1] === "/" || raw[1] === "\\") return "/";
  return raw;
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run web/src/lib/returnTo.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/returnTo.ts web/src/lib/returnTo.test.ts
git commit -m "feat(web): safeReturnTo, a whitelist for post-login destinations"
```

---

## Task 3: The guards remember where you were going

**Files:**
- Modify: `web/src/components/guards.tsx`
- Modify: `web/src/components/guards.test.tsx`

- [ ] **Step 1: Add the failing tests**

Append to `web/src/components/guards.test.tsx`:

```tsx
// The bounce has to carry the attempted location, or a guard sends everyone to
// the home page after login and the deep link they clicked is lost. Asserted on
// the rendered Location rather than on the guard's internals: what matters is
// what the router receives.
test("RequireAuth sends an anonymous visitor to the login route", async () => {
  await renderWithSession(
    <Routes>
      <Route path="/planning_repet" element={<RequireAuth>{secret}</RequireAuth>} />
      <Route path="/authentification_inscription" element={<ShowState />} />
    </Routes>,
    { route: "/planning_repet" },
  );
  expect(await screen.findByTestId("from")).toHaveTextContent("/planning_repet");
});

test("RequireCapability carries the location too, query string included", async () => {
  await renderWithSession(
    <Routes>
      <Route
        path="/admin"
        element={<RequireCapability capability="manage_events">{secret}</RequireCapability>}
      />
      <Route path="/authentification_inscription" element={<ShowState />} />
    </Routes>,
    { route: "/admin?tab=events" },
  );
  expect(await screen.findByTestId("from")).toHaveTextContent("/admin?tab=events");
});
```

and add to the top of the file, after the existing imports:

```tsx
import { Route, Routes, useLocation } from "react-router-dom";

/** Renders whatever the guard put in router state, so a test can read it. */
function ShowState() {
  const { state } = useLocation();
  return <p data-testid="from">{(state as { from?: string } | null)?.from ?? "(none)"}</p>;
}
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run web/src/components/guards.test.tsx`
Expected: FAIL — both new tests render `(none)`, because the guards pass no state yet.

- [ ] **Step 3: Carry the location**

In `web/src/components/guards.tsx`, change the import line:

```tsx
import { Navigate, useLocation } from "react-router-dom";
```

Add this helper below the docblock:

```tsx
/**
 * Where the visitor was trying to go, as a path the login route can navigate
 * back to. Router STATE, not a query parameter: it never appears in a URL, so
 * nobody can craft it, and the old page's open-redirect guard is unnecessary
 * here. `safeReturnTo` still normalises it on the way out — see lib/returnTo.
 */
function useAttemptedPath(): string {
  const location = useLocation();
  return `${location.pathname}${location.search}`;
}
```

Then in **both** guards, replace each anonymous-branch `<Navigate>` with one carrying the state. `RequireAuth` becomes:

```tsx
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const from = useAttemptedPath();
  if (!user) {
    return <Navigate to="/authentification_inscription" state={{ from }} replace />;
  }
  return <>{children}</>;
}
```

and `RequireCapability`'s first branch becomes:

```tsx
  if (!user) {
    return <Navigate to="/authentification_inscription" state={{ from }} replace />;
  }
```

with `const from = useAttemptedPath();` alongside its `useSession()` call. **Both hooks must be called unconditionally, above the branches** — calling `useAttemptedPath()` inside the `if` breaks the rules of hooks and `npm run lint:js` will fail on it.

- [ ] **Step 4: Run and watch them pass**

Run: `npx vitest run web/src/components/guards.test.tsx`
Expected: PASS, 11 tests — the 9 that existed plus the 2 new ones.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/guards.tsx web/src/components/guards.test.tsx
git commit -m "feat(web): guards carry the attempted path when they bounce to login"
```

---

## Task 4: `/confirmation`

Done before the contact form, because that form navigates here on success.

**Files:**
- Create: `web/src/pages/Confirmation.tsx`
- Create: `web/src/pages/Confirmation.test.tsx`
- Modify: `web/src/routes.tsx`

- [ ] **Step 1: Write the failing test**

Create `web/src/pages/Confirmation.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { Confirmation } from "./Confirmation";

test("it says the form was sent and that an email follows", () => {
  render(<Confirmation />);
  expect(
    screen.getByRole("heading", { name: "Formulaire envoyé avec succès !" }),
  ).toBeInTheDocument();
  expect(screen.getByText(/vous recevrez bientôt un e-mail de confirmation/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run web/src/pages/Confirmation.test.tsx`
Expected: FAIL — `Failed to resolve import "./Confirmation"`.

- [ ] **Step 3: Write the page**

Create `web/src/pages/Confirmation.tsx`:

```tsx
/**
 * Where the contact form lands on success.
 *
 * Its own URL rather than an inline success state, because that is what
 * app/pages/confirmation.php was and the path is in the wild. Nothing here is
 * dynamic: the old page was twelve lines of static markup and this is the same
 * twelve lines.
 */
export function Confirmation() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-8">
      <h2 className="text-2xl font-bold">Formulaire envoyé avec succès !</h2>
      <p className="mt-4">
        Merci d’avoir rempli le formulaire. Vous recevrez bientôt un e-mail de confirmation.
      </p>
    </section>
  );
}
```

- [ ] **Step 4: Wire the route**

In `web/src/routes.tsx`, add to the import block:

```tsx
import { Confirmation } from "./pages/Confirmation";
```

and replace this line:

```tsx
        <Route path="/confirmation" element={<Placeholder title="Confirmation" />} />
```

with:

```tsx
        <Route path="/confirmation" element={<Confirmation />} />
```

- [ ] **Step 5: Run and watch it pass**

Run: `npx vitest run web/src/pages/Confirmation.test.tsx && npm run typecheck`
Expected: PASS, 1 test; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/Confirmation.tsx web/src/pages/Confirmation.test.tsx web/src/routes.tsx
git commit -m "feat(web): port the contact confirmation page"
```

---

## Task 5: The login form

The logged-in half of this route is Task 6. This task builds the anonymous half.

**Files:**
- Create: `web/src/pages/Login.tsx`
- Create: `web/src/pages/Login.test.tsx`
- Modify: `web/src/routes.tsx`

- [ ] **Step 1: Write the failing tests**

Create `web/src/pages/Login.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { Route, Routes } from "react-router-dom";
import { expect, test } from "vitest";

import { server } from "../mocks/node";
import { renderWithSession } from "../test/renderWithSession";
import { Login } from "./Login";

/**
 * The login route plus a couple of destinations, so a test can assert on where
 * a successful login LANDED rather than on the fact that a request was made.
 * Navigating is half the behaviour.
 */
const app = (
  <Routes>
    <Route path="/authentification_inscription" element={<Login />} />
    <Route path="/" element={<p>Accueil</p>} />
    <Route path="/planning_repet" element={<p>Planning</p>} />
  </Routes>
);

const signIn = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
  await user.type(await screen.findByLabelText("Identifiant :"), name);
  await user.type(screen.getByLabelText("Mot de passe :"), "demo");
  await user.click(screen.getByRole("button", { name: "Se connecter" }));
};

test("an anonymous visitor gets the old form", async () => {
  await renderWithSession(app, { route: "/authentification_inscription" });
  expect(await screen.findByRole("heading", { name: "Authentification" })).toBeInTheDocument();
  expect(screen.getByLabelText("Identifiant :")).toBeRequired();
  expect(screen.getByLabelText("Mot de passe :")).toBeRequired();
  expect(screen.getByLabelText("Mot de passe :")).toHaveAttribute("type", "password");
});

test("a successful login lands on the home page", async () => {
  const user = userEvent.setup();
  await renderWithSession(app, { route: "/authentification_inscription" });
  await signIn(user, "demo.admin");
  expect(await screen.findByText("Accueil")).toBeInTheDocument();
});

// The session is cached at staleTime: Infinity, so nothing shows the new user
// unless the login invalidates it. Without that the app stays anonymous until
// the next full page load — which the old site's window.location.href hid.
test("the session is visible afterwards, with no reload", async () => {
  const user = userEvent.setup();
  await renderWithSession(
    <Routes>
      <Route path="/authentification_inscription" element={<Login />} />
      <Route path="/" element={<Login />} />
    </Routes>,
    { route: "/authentification_inscription" },
  );
  await signIn(user, "demo.admin");
  expect(await screen.findByText(/Connecté en tant que/)).toHaveTextContent("demo.admin");
});

test("a bad password shows the French message and does NOT navigate", async () => {
  const user = userEvent.setup();
  await renderWithSession(app, { route: "/authentification_inscription" });
  await user.type(await screen.findByLabelText("Identifiant :"), "demo.admin");
  await user.type(screen.getByLabelText("Mot de passe :"), "wrong");
  await user.click(screen.getByRole("button", { name: "Se connecter" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Nom d'utilisateur ou mot de passe incorrect",
  );
  expect(screen.queryByText("Accueil")).toBeNull();
  expect(screen.getByLabelText("Identifiant :")).toBeInTheDocument();
  // Re-enabled by the mutation settling: a slow or refused login must never
  // leave a legitimate retry permanently blocked.
  expect(screen.getByRole("button", { name: "Se connecter" })).toBeEnabled();
});

test("the submit button is disabled while the request is in flight", async () => {
  const user = userEvent.setup();
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  server.use(
    http.post("/api/login", async () => {
      await held;
      return HttpResponse.json({ role: "admin" });
    }),
  );

  await renderWithSession(app, { route: "/authentification_inscription" });
  await signIn(user, "demo.admin");
  const submit = screen.getByRole("button", { name: "Se connecter" });
  await waitFor(() => expect(submit).toBeDisabled());
  release();
});
```

Note the apostrophe in the expected message: `fr.ts` spells `invalid_credentials` with a straight `'` ("Nom d'utilisateur…"), not a typographic one. Copy it from `fr.ts` rather than retyping it.

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run web/src/pages/Login.test.tsx`
Expected: FAIL — `Failed to resolve import "./Login"`.

- [ ] **Step 3: Write the page**

Create `web/src/pages/Login.tsx`. The logged-in branch is a stub for this task and gets its real body in Task 6 — it is present now only because the "session is visible afterwards" test asserts on it.

```tsx
import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { getAuthUserQueryKey, useAuthLogin } from "../api/generated/endpoints";
import { useApiFormError } from "../api/useApiFormError";
import { FormField } from "../components/FormField";
import { safeReturnTo } from "../lib/returnTo";
import { useSession } from "../session/SessionProvider";

/**
 * One route, two states.
 *
 * The old site had no logged-in state for this URL: logout was a button on
 * /admin. Until that page is ported this is the only way to end a session in
 * the SPA, which is why the two live together rather than the route redirecting
 * an authenticated visitor away.
 */
export function Login() {
  const { user } = useSession();
  return user ? <LoggedIn username={user.username} /> : <LoginForm />;
}

function LoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { error, setFromThrown, clear, messageFor } = useApiFormError(
    "La connexion a échoué. Veuillez réessayer.",
  );
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const queryClient = useQueryClient();

  // Router state first — that is how the guards hand over. The query parameter
  // is the old site's mechanism, still honoured because links carrying one are
  // in the wild. Both go through safeReturnTo; only the second can be hostile.
  const destination = safeReturnTo(
    (location.state as { from?: unknown } | null)?.from ?? params.get("returnTo"),
  );

  const login = useAuthLogin({
    mutation: {
      onSuccess: async () => {
        clear();
        // THE load-bearing line. SessionProvider holds GET /api/user at
        // staleTime: Infinity, so invalidating this key is the only thing that
        // makes the new session visible. The old page reloaded the document
        // instead; a SPA that did the same would throw away the router and the
        // whole Query cache to learn one fact.
        //
        // getConfigQueryKey() is deliberately NOT invalidated: ConfigController
        // never touches Auth, so /api/config does not vary by user.
        //
        // Awaited, so the navigation lands on a page that already knows who is
        // logged in rather than one that renders anonymous and then corrects
        // itself.
        await queryClient.invalidateQueries({ queryKey: getAuthUserQueryKey() });
        navigate(destination, { replace: true });
      },
      onError: setFromThrown,
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    clear();
    login.mutate({ data: { username, password } });
  };

  return (
    <section className="mx-auto max-w-md px-4 py-8">
      <h2 className="text-2xl font-bold">Authentification</h2>

      {/* Inline, not the old alert(). A modal browser dialog is unstyled,
          dismissible only by acknowledgement, and on mobile reads as a warning
          about the browser rather than about the form. */}
      {error ? (
        <p role="alert" className="mt-4 text-canetons-red">
          {error.message}
        </p>
      ) : null}

      <form onSubmit={submit} className="mt-4 space-y-3">
        <FormField
          id="login-username"
          label="Identifiant :"
          required
          autoComplete="username"
          value={username}
          onChange={setUsername}
          problem={messageFor("username")}
        />
        <FormField
          id="login-password"
          label="Mot de passe :"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
          problem={messageFor("password")}
        />
        <button type="submit" disabled={login.isPending} className="rounded border px-3 py-1">
          Se connecter
        </button>
      </form>
    </section>
  );
}

// Replaced in the next task with the real logout control.
function LoggedIn({ username }: { username: string }) {
  return (
    <section className="mx-auto max-w-md px-4 py-8">
      <h2 className="text-2xl font-bold">Authentification</h2>
      <p className="mt-4">
        Connecté en tant que <strong>{username}</strong>
      </p>
    </section>
  );
}
```

- [ ] **Step 4: Wire the route**

In `web/src/routes.tsx`, add to the import block:

```tsx
import { Login } from "./pages/Login";
```

and replace this line:

```tsx
        <Route path="/authentification_inscription" element={<Placeholder title="Connexion" />} />
```

with:

```tsx
        <Route path="/authentification_inscription" element={<Login />} />
```

- [ ] **Step 5: Run and watch them pass**

Run: `npx vitest run web/src/pages/Login.test.tsx && npm run typecheck && npm run lint:js`
Expected: PASS, 5 tests; typecheck and lint clean.

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/Login.tsx web/src/pages/Login.test.tsx web/src/routes.tsx
git commit -m "feat(web): the login form

Succeeds by invalidating the session query, never by reloading the document as
the old page did — a SPA that reloads throws away the router and the whole
Query cache to learn one fact. A bad password renders inline in French instead
of in an alert(), and does not navigate."
```

---

## Task 6: Logout, and `returnTo`

**Files:**
- Modify: `web/src/pages/Login.tsx`
- Modify: `web/src/pages/Login.test.tsx`

- [ ] **Step 1: Add the failing tests**

Append to `web/src/pages/Login.test.tsx`:

```tsx
test("an authenticated visitor gets the logout view, not the form", async () => {
  setMockUser("demo.moderator");
  await renderWithSession(app, { route: "/authentification_inscription" });
  expect(await screen.findByText(/Connecté en tant que/)).toHaveTextContent("demo.moderator");
  expect(screen.queryByLabelText("Identifiant :")).toBeNull();
});

test("logging out clears the session and returns to the home page", async () => {
  const user = userEvent.setup();
  setMockUser("demo.admin");
  await renderWithSession(app, { route: "/authentification_inscription" });
  await user.click(await screen.findByRole("button", { name: "Se déconnecter" }));
  expect(await screen.findByText("Accueil")).toBeInTheDocument();
});

test("a returnTo in router state is honoured", async () => {
  const user = userEvent.setup();
  await renderWithSession(app, {
    route: "/authentification_inscription",
    state: { from: "/planning_repet" },
  });
  await signIn(user, "demo.admin");
  expect(await screen.findByText("Planning")).toBeInTheDocument();
});

test("a legacy ?returnTo= query is honoured", async () => {
  const user = userEvent.setup();
  await renderWithSession(app, {
    route: "/authentification_inscription?returnTo=%2Fplanning_repet",
  });
  await signIn(user, "demo.admin");
  expect(await screen.findByText("Planning")).toBeInTheDocument();
});

// The whole point of safeReturnTo, asserted through the page rather than only
// as a unit: a hostile destination must land on the home page.
test("a hostile returnTo falls back to the home page", async () => {
  const user = userEvent.setup();
  await renderWithSession(app, {
    route: "/authentification_inscription",
    state: { from: "//evil.com" },
  });
  await signIn(user, "demo.admin");
  expect(await screen.findByText("Accueil")).toBeInTheDocument();
});
```

Add `setMockUser` to the file's imports:

```tsx
import { setMockUser } from "../mocks/handlers";
```

- [ ] **Step 2: Teach `renderWithSession` about router state**

`web/src/test/renderWithSession.tsx` currently accepts only a `route`. Two of the new tests need initial router state. Change its signature and its `MemoryRouter`:

```tsx
export async function renderWithSession(
  ui: ReactNode,
  { route = "/", state }: { route?: string; state?: unknown } = {},
) {
```

and:

```tsx
  // A plain string entry is parsed by the router into pathname/search/hash; an
  // OBJECT entry is not — its `pathname` is taken literally, so
  // "/login?returnTo=/x" would arrive with the query buried in the path and
  // `location.search` empty. Since state can only be supplied through the
  // object form, the split has to happen here.
  const [pathname = "/", query] = route.split("?");
  const entry = { pathname, search: query ? `?${query}` : "", state };
```

```tsx
    <MemoryRouter initialEntries={[entry]}>
```

- [ ] **Step 3: Run and watch them fail**

Run: `npx vitest run web/src/pages/Login.test.tsx`
Expected: FAIL — no "Se déconnecter" button exists, and the returnTo tests land on "Accueil" instead of "Planning".

- [ ] **Step 4: Implement logout**

In `web/src/pages/Login.tsx`, add `useAuthLogout` to the generated import:

```tsx
import { getAuthUserQueryKey, useAuthLogin, useAuthLogout } from "../api/generated/endpoints";
```

and replace the stub `LoggedIn` with:

```tsx
/**
 * The account view: who you are, and the only way to stop being them.
 *
 * The old site's logout lived on /admin, which is not ported yet — and even
 * once it is, a member who is not an admin never sees that page, so this stays.
 */
function LoggedIn({ username }: { username: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { error, setFromThrown } = useApiFormError(
    "La déconnexion a échoué. Veuillez réessayer.",
  );

  const logout = useAuthLogout({
    mutation: {
      onSuccess: async () => {
        // Same reason as the login side: the session query is cached forever,
        // so it has to be invalidated or the app keeps showing the old user.
        // The refetch answers 401, which SessionProvider reads as "anonymous"
        // — that is a normal answer there, not a failure.
        await queryClient.invalidateQueries({ queryKey: getAuthUserQueryKey() });
        navigate("/", { replace: true });
      },
      onError: setFromThrown,
    },
  });

  // No <section> or <h2> here: Task 5 hoisted the route's wrapper and heading
  // into `Login`, so both branches render only their own body. Putting them
  // back would duplicate chrome that has to be edited in lockstep forever.
  return (
    <>
      <p className="mt-4">
        Connecté en tant que <strong>{username}</strong>
      </p>

      {error ? (
        <p role="alert" className="mt-4 text-canetons-red">
          {error.message}
        </p>
      ) : null}

      {/* Guarded by the early return as well as the attribute — see the login
          side. `logout.mutate()` takes no argument: the generated hook types
          its variables as `void`. */}
      <button
        type="button"
        onClick={() => {
          if (logout.isPending) return;
          logout.mutate();
        }}
        disabled={logout.isPending}
        className="mt-4 rounded border px-3 py-1"
      >
        Se déconnecter
      </button>
    </>
  );
}
```

> **Note for Task 9a:** the `role="alert"` above and the `disabled` on that
> button are the house pattern as it stands today. Task 9a changes both across
> every form at once — write them this way here, and do not fix them early.

`returnTo` needs no new code — Task 5 already reads router state and the query parameter through `safeReturnTo`. If those three tests still fail after this step, the bug is in that expression, not here.

- [ ] **Step 5: Run and watch them pass**

Run: `npx vitest run web/src/pages && npm run typecheck && npm run lint:js`
Expected: PASS — Login is now 10 tests, and every other page suite still passes.

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/Login.tsx web/src/pages/Login.test.tsx web/src/test/renderWithSession.tsx
git commit -m "feat(web): logout, and honour the post-login destination

Until /admin is ported this is the only way to end a session in the SPA. The
destination comes from router state, with the old ?returnTo= query still
honoured for links already in the wild; both go through safeReturnTo."
```

---

## Task 7: The contact form

**Files:**
- Create: `web/src/pages/Contact.tsx`
- Create: `web/src/pages/Contact.test.tsx`
- Modify: `web/src/mocks/handlers.ts`
- Modify: `web/src/routes.tsx`

- [ ] **Step 1: Add the hand-written mock**

Only orval's generated catch-all covers `POST /api/contact` today, and a generated handler cannot be made to fail on demand. In `web/src/mocks/handlers.ts`, add this to the `overrides` array, immediately after the `http.get("/api/user", …)` entry:

```ts
  // Hand-written because the generated handler always succeeds, and the whole
  // point of a contact form is what it does when it does not. The required set
  // mirrors api/app/Http/Requests/ContactRequest.php exactly — including
  // `subject`, which the OLD HTML form did not mark required even though the
  // API always has.
  http.post("/api/contact", async ({ request }) => {
    const body = (await request.json()) as Record<string, string | undefined>;
    const missing = ["lastName", "firstName", "email", "subject", "message"].filter(
      (field) => !body[field],
    );
    if (missing.length > 0) {
      return HttpResponse.json(
        {
          error: "Invalid form submission",
          code: "validation_failed",
          fields: missing.map((field) => ({ field, reason: "required" })),
        },
        { status: 422 },
      );
    }
    return HttpResponse.json({ ok: true });
  }),
```

- [ ] **Step 2: Write the failing tests**

Create `web/src/pages/Contact.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { Route, Routes } from "react-router-dom";
import { expect, test } from "vitest";

import { server } from "../mocks/node";
import { renderWithSession } from "../test/renderWithSession";
import { Contact } from "./Contact";

const app = (
  <Routes>
    <Route path="/contact" element={<Contact />} />
    <Route path="/confirmation" element={<p>Merci</p>} />
  </Routes>
);

async function fillValidMessage(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText("Nom:"), "Canard");
  await user.type(screen.getByLabelText("Prénom:"), "Donald");
  await user.type(screen.getByLabelText("E-mail:"), "donald@example.com");
  await user.type(screen.getByLabelText("Sujet:"), "Une question");
  await user.type(screen.getByLabelText("Contenu du message:"), "Bonjour les canetons !");
}

test("the five old fields are present, in the old order", async () => {
  await renderWithSession(app, { route: "/contact" });
  expect(await screen.findByRole("heading", { name: "Contact" })).toBeInTheDocument();
  expect(screen.getByLabelText("Contenu du message:").tagName).toBe("TEXTAREA");
});

// The old markup left `subject` optional while the API always required it, so a
// blank subject made a round trip and came back as a generic alert. Pinned so
// the fix is not "tidied" back to parity.
test("every field is required, subject included", async () => {
  await renderWithSession(app, { route: "/contact" });
  for (const label of ["Nom:", "Prénom:", "E-mail:", "Sujet:", "Contenu du message:"]) {
    expect(await screen.findByLabelText(label)).toBeRequired();
  }
});

test("a sent message lands on the confirmation page", async () => {
  const user = userEvent.setup();
  await renderWithSession(app, { route: "/contact" });
  await fillValidMessage(user);
  await user.click(screen.getByRole("button", { name: "Envoyer" }));
  expect(await screen.findByText("Merci")).toBeInTheDocument();
});

test("a validation error renders in French against the offending field", async () => {
  const user = userEvent.setup();
  server.use(
    http.post("/api/contact", () =>
      HttpResponse.json(
        {
          error: "Invalid form submission",
          code: "validation_failed",
          fields: [{ field: "email", reason: "invalid_format" }],
        },
        { status: 422 },
      ),
    ),
  );

  await renderWithSession(app, { route: "/contact" });
  await fillValidMessage(user);
  await user.click(screen.getByRole("button", { name: "Envoyer" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Le formulaire contient des erreurs.");
  expect(screen.getByText("E-mail n'est pas dans un format valide")).toBeInTheDocument();
  expect(screen.getByLabelText("E-mail:")).toHaveAttribute("aria-invalid", "true");
  expect(screen.queryByText("Merci")).toBeNull();
});

test("a rejected message keeps what was typed", async () => {
  const user = userEvent.setup();
  server.use(
    http.post("/api/contact", () =>
      HttpResponse.json(
        { error: "Invalid form submission", code: "validation_failed", fields: [] },
        { status: 422 },
      ),
    ),
  );

  await renderWithSession(app, { route: "/contact" });
  await fillValidMessage(user);
  await user.click(screen.getByRole("button", { name: "Envoyer" }));

  await screen.findByRole("alert");
  expect(screen.getByLabelText("Contenu du message:")).toHaveValue("Bonjour les canetons !");
});
```

Copy the expected French from `web/src/i18n/fr.ts` rather than retyping it — `invalid_format` reads "n'est pas dans un format valide" with a straight apostrophe.

- [ ] **Step 3: Run and watch them fail**

Run: `npx vitest run web/src/pages/Contact.test.tsx`
Expected: FAIL — `Failed to resolve import "./Contact"`.

- [ ] **Step 4: Write the page**

Create `web/src/pages/Contact.tsx`:

```tsx
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { useContact } from "../api/generated/endpoints";
import type { ContactRequest } from "../api/generated/model";
import { useApiFormError } from "../api/useApiFormError";
import { FormField } from "../components/FormField";

const EMPTY: ContactRequest = {
  lastName: "",
  firstName: "",
  email: "",
  subject: "",
  message: "",
};

/**
 * Field order and labels are the old page's, colons and all — including the
 * missing space before them, which the planning page does have. That
 * inconsistency is in the live site and is not being tidied here.
 *
 * `subject` is `required`, which the old markup was NOT even though
 * ContactRequest has always required it. A blank subject used to pass the
 * browser, make a round trip, be rejected, and surface as a generic
 * "Échec de l'envoi du formulaire" alert that named no field. Deliberate fix.
 */
const FIELDS: {
  name: keyof ContactRequest;
  label: string;
  type?: string;
  as?: "input" | "textarea";
  autoComplete?: string;
}[] = [
  { name: "lastName", label: "Nom:", autoComplete: "family-name" },
  { name: "firstName", label: "Prénom:", autoComplete: "given-name" },
  { name: "email", label: "E-mail:", type: "email", autoComplete: "email" },
  { name: "subject", label: "Sujet:" },
  { name: "message", label: "Contenu du message:", as: "textarea" },
];

export function Contact() {
  const [values, setValues] = useState<ContactRequest>(EMPTY);
  const { error, setFromThrown, clear, messageFor } = useApiFormError(
    "L’envoi du formulaire a échoué. Veuillez réessayer.",
  );
  const navigate = useNavigate();

  const send = useContact({
    mutation: {
      // Pushed, not replaced: the old page assigned window.location.href, so
      // Back returned to the form. Keep that.
      onSuccess: () => navigate("/confirmation"),
      onError: setFromThrown,
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    clear();
    send.mutate({ data: values });
  };

  return (
    <section className="mx-auto max-w-2xl px-4 py-8">
      <h2 className="text-2xl font-bold">Contact</h2>

      {error ? (
        <p role="alert" className="mt-4 text-canetons-red">
          {error.message}
        </p>
      ) : null}

      {/* The values are NOT cleared on failure: a rejected message must not
          make someone retype it. Same rule as the event form. */}
      <form onSubmit={submit} className="mt-4 space-y-3">
        {FIELDS.map((field) => (
          <FormField
            key={field.name}
            id={`contact-${field.name}`}
            label={field.label}
            type={field.type}
            as={field.as}
            required
            autoComplete={field.autoComplete}
            problem={messageFor(field.name)}
            value={values[field.name]}
            onChange={(next) => setValues((previous) => ({ ...previous, [field.name]: next }))}
          />
        ))}
        <button type="submit" disabled={send.isPending} className="rounded border px-3 py-1">
          Envoyer
        </button>
      </form>
    </section>
  );
}
```

- [ ] **Step 5: Wire the route**

In `web/src/routes.tsx`, add to the import block:

```tsx
import { Contact } from "./pages/Contact";
```

and replace this line:

```tsx
        <Route path="/contact" element={<Placeholder title="Contact" />} />
```

with:

```tsx
        <Route path="/contact" element={<Contact />} />
```

- [ ] **Step 6: Run and watch them pass**

Run: `npx vitest run && npm run typecheck && npm run lint:js`
Expected: every suite passes. `web/src/mocks/handlers.test.ts` asserts on behaviour rather than on a handler count, so adding one handler needs no change there — if it fails, the new handler is wrong.

- [ ] **Step 7: Commit**

```bash
git add web/src/pages/Contact.tsx web/src/pages/Contact.test.tsx web/src/mocks/handlers.ts web/src/routes.tsx
git commit -m "feat(web): port the contact form

Sujet is marked required, which the old markup was not even though
ContactRequest has always required it — a blank subject used to make a round
trip and come back as an alert that named no field. Failures now render per
field, in French, and the form keeps what was typed."
```

---

## Task 8: End-to-end, through the real form

**Files:**
- Create: `web/e2e/auth.spec.ts`
- Modify: `web/e2e/planning.spec.ts`

- [ ] **Step 1: Replace the e2e login helper**

`web/e2e/planning.spec.ts`'s `login()` POSTs to `/api/login` from `page.evaluate` because there was no login page. There is one now, and its own docblock says to make this change.

Replace the entire `login` function — docblock included — with:

```ts
/**
 * Logs in through the real form, which is the point: this used to POST to
 * /api/login from page.evaluate because /authentification_inscription was a
 * placeholder.
 *
 * It waits for the navigation's own username to appear rather than for the
 * request to return. The nav item is proof the SESSION is live, not merely that
 * the endpoint answered — which is exactly the failure mode of forgetting to
 * invalidate the session query.
 */
async function login(page: import("@playwright/test").Page, username: string) {
  await page.goto("/authentification_inscription");
  await page.getByLabel("Identifiant :").fill(username);
  await page.getByLabel("Mot de passe :").fill("demo");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("link", { name: username })).toBeVisible();
}
```

The helper no longer navigates to the planning page, so each of the three tests that used it must now go there itself. In **"an admin can add an event"** and **"opening the edit form never paints it empty"**, replace:

```ts
  await page.goto("/planning_repet");
  await login(page, "demo.admin");
```

with:

```ts
  await login(page, "demo.admin");
  await page.goto("/planning_repet");
```

In "opening the edit form never paints it empty", the following `await page.getByLabel("Date :").waitFor();` line stays exactly where it is.

- [ ] **Step 2: Write the auth spec**

Create `web/e2e/auth.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("logging in through the form makes the session live without a reload", async ({ page }) => {
  await page.goto("/authentification_inscription");
  await page.getByLabel("Identifiant :").fill("demo.admin");
  await page.getByLabel("Mot de passe :").fill("demo");
  await page.getByRole("button", { name: "Se connecter" }).click();

  // The nav shows the username, which only happens once GET /api/user has been
  // refetched — i.e. once the login invalidated it.
  await expect(page.getByRole("link", { name: "demo.admin" })).toBeVisible();
});

test("a wrong password is refused in French and stays on the form", async ({ page }) => {
  await page.goto("/authentification_inscription");
  await page.getByLabel("Identifiant :").fill("demo.admin");
  await page.getByLabel("Mot de passe :").fill("pas-le-bon");
  await page.getByRole("button", { name: "Se connecter" }).click();

  await expect(page.getByRole("alert")).toContainText("mot de passe incorrect");
  await expect(page.getByLabel("Identifiant :")).toBeVisible();
});

test("a guard sends you to login and login sends you back", async ({ page }) => {
  await page.goto("/authentification_inscription");
  await page.getByLabel("Identifiant :").fill("demo.admin");
  await page.getByLabel("Mot de passe :").fill("demo");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("link", { name: "demo.admin" })).toBeVisible();

  // The admin form on the planning page is the visible proof the capability
  // survived the round trip.
  await page.goto("/planning_repet");
  await expect(page.getByLabel("Date :")).toBeVisible();
});

test("logging out ends the session", async ({ page }) => {
  await page.goto("/authentification_inscription");
  await page.getByLabel("Identifiant :").fill("demo.admin");
  await page.getByLabel("Mot de passe :").fill("demo");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("link", { name: "demo.admin" })).toBeVisible();

  await page.goto("/authentification_inscription");
  await page.getByRole("button", { name: "Se déconnecter" }).click();

  await expect(page.getByRole("link", { name: "Connexion" })).toBeVisible();
  await page.goto("/planning_repet");
  await expect(page.getByLabel("Date :")).toHaveCount(0);
});

test("the contact form sends and lands on the confirmation page", async ({ page }) => {
  await page.goto("/contact");
  await page.getByLabel("Nom:").fill("Canard");
  await page.getByLabel("Prénom:").fill("Donald");
  await page.getByLabel("E-mail:").fill("donald@example.com");
  await page.getByLabel("Sujet:").fill("Une question");
  await page.getByLabel("Contenu du message:").fill("Bonjour les canetons !");
  await page.getByRole("button", { name: "Envoyer" }).click();

  await expect(
    page.getByRole("heading", { name: "Formulaire envoyé avec succès !" }),
  ).toBeVisible();
});
```

- [ ] **Step 3: Run the whole e2e suite**

Run: `npm run test:e2e`
Expected: 11 passed — the 6 that existed plus 5 new.

If the "logging out ends the session" test fails on the nav still showing the username, the logout is not invalidating `getAuthUserQueryKey()`.

- [ ] **Step 4: Commit**

```bash
git add web/e2e
git commit -m "test(web): log in through the real form end to end

The planning spec's helper stops POSTing to /api/login from page.evaluate — the
stopgap its own docblock said to remove once the login route existed. It now
waits for the nav's username, which is proof the SESSION is live rather than
that the endpoint answered."
```

---

## Task 9: Verify against the real API

The mocks cannot prove the contract. This is the same pass `/planning_repet` got.

**Files:** none — this task changes nothing.

- [ ] **Step 1: Bring the stack up and build**

```bash
npm run dev
npm run build
```

- [ ] **Step 2: Check the three seeded accounts on the real API**

Open http://localhost:5173/authentification_inscription — the dev stack's own Vite, which proxies to the real Laravel — and for each of `demo.admin`, `demo.moderator`, `demo.user` (password `demo`):

- logging in shows the username in the navigation;
- reloading the page keeps you logged in (a real Sanctum cookie, not client state);
- `demo.admin` sees the admin form on `/planning_repet`; `demo.user` and `demo.moderator` do not;
- "Se déconnecter" returns the navigation to "Connexion", and `/planning_repet` loses the admin form.

- [ ] **Step 3: Check the failure path**

Log in with a wrong password. Expect the inline French message, no navigation, and **no** `alert()`.

- [ ] **Step 4: Note what cannot be checked here**

**No route is wrapped in `RequireAuth` or `RequireCapability` yet** — `grep RequireAuth web/src/routes.tsx` returns nothing. Every gated page belongs to chunk C. So the guard round trip has no URL to exercise it against, and Task 3's unit tests are its only coverage until then.

Do not manufacture a guarded route to test this. Record it as a known gap for the chunk C plan, which wires the first ones.

- [ ] **Step 5: Send a real contact message**

At http://localhost:5173/contact, send a valid message. Expect `/confirmation`. Then confirm the row reached the database:

```bash
docker compose exec db mariadb -ulescanetons -plescanetons lescanetons \
  -e "SELECT id, first_name, last_name, email, subject FROM contact_messages ORDER BY id DESC LIMIT 3;"
```

Expect the message you just sent, with `first_name`/`last_name` populated — the snake_case columns behind the camelCase API fields.

- [ ] **Step 6: Check a real validation error**

Send a message with an over-long subject (paste 300 characters). Expect Laravel's own rejection rendered as "Sujet est trop long (maximum 255 caractères)" against the Sujet input, with `aria-invalid` set — not a generic message. This is the check that proves `translateApiError` is fed by the real API and not only by a mock.

- [ ] **Step 7: Clean up**

Delete the test rows you created:

```bash
docker compose exec db mariadb -ulescanetons -plescanetons lescanetons \
  -e "DELETE FROM contact_messages WHERE email = 'donald@example.com';"
```

---

## Task 9a: The alert pattern, fixed once across every form

Raised by the code-quality review of Task 5. **Both findings are in this plan's own supplied code, and both already exist in `EventForm.tsx` from before this plan.** They are here rather than inside Task 5 because they are a house-pattern change across files that already have passing tests — doing them per-form would mean doing them five times and reviewing them five times.

Do this task only after Task 8, so every form that will exist is in the tree and gets the same treatment in one pass.

**Files:**
- Modify: `web/src/pages/Login.tsx`, `web/src/pages/Contact.tsx`, `web/src/pages/EventForm.tsx`
- Modify: whichever tests assert on `role="alert"` — at minimum `web/src/pages/EventForm.test.tsx`, `web/src/pages/Login.test.tsx`, `web/src/pages/Contact.test.tsx`, `web/src/pages/PlanningRepet.test.tsx`

### Finding 1: the live region is inserted, not resident

Every form renders its error like this:

```tsx
{error ? (
  <p role="alert" className="mt-4 text-canetons-red">
    {error.message}
  </p>
) : null}
```

ARIA requires a live region to be **in the accessibility tree before its content changes** for the change to be announced. `role="alert"` is the special case most browser/AT pairs announce on insertion — NVDA with Firefox or Chrome, JAWS with Chrome — but VoiceOver with Safari frequently misses a freshly-inserted alert, and any engine can miss one when the insertion lands in the same commit as other DOM churn. Which is exactly what happens here: the alert appears in the same React commit that re-enables the submit button.

Keep the region resident and change only its children:

```tsx
<div role="alert">
  {error ? <p className="mt-4 text-canetons-red">{error.message}</p> : null}
</div>
```

**This breaks existing tests, and that is the work.** `findByRole("alert")` currently waits for the element to appear; against a resident region it resolves immediately with an empty div, so `expect(await screen.findByRole("alert")).toHaveTextContent(...)` asserts against empty content and fails. Every such assertion becomes:

```tsx
await waitFor(() =>
  expect(screen.getByRole("alert")).toHaveTextContent("Le formulaire contient des erreurs."),
);
```

and any `expect(screen.queryByRole("alert")).toBeNull()` becomes an assertion that the region is *empty*, not absent:

```tsx
expect(screen.getByRole("alert")).toBeEmptyDOMElement();
```

Find them all with `grep -rn 'role="alert"\|ByRole("alert")' web/src`. Note `web/src/components/guards.tsx` and `web/src/session/SessionProvider.tsx` also use `role="alert"`, but for content that is present from first render rather than appearing later — leave both alone, and say so in the commit message so the inconsistency reads as deliberate.

### Finding 2: disabling the focused button drops focus to `<body>`

```tsx
<button type="submit" disabled={pending}>
```

The user activates the button, so focus is on it. React commits `disabled`. Chrome and Firefox blur a newly-disabled focused element to `document.body`. The request fails, the button re-enables — and focus is gone. Combined with finding 1, a failed submission can produce **no** perceptible feedback for a keyboard or screen-reader user.

Use `aria-disabled` instead, which keeps the control focusable and in the tab order while announcing as unavailable:

```tsx
<button type="submit" aria-disabled={pending} className="... aria-disabled:opacity-50 aria-disabled:cursor-not-allowed">
```

The actual guard is then the early return in the submit handler, which Task 5 already added to `Login.tsx`:

```tsx
if (pending) return;
```

Add the same guard to `EventForm.tsx` and `Contact.tsx` in this task — with `aria-disabled` the button is still clickable, so the guard stops being belt-and-braces and becomes the only thing preventing a double submit.

Tests asserting `toBeDisabled()` / `toBeEnabled()` must become assertions on the attribute:

```tsx
await waitFor(() => expect(submit).toHaveAttribute("aria-disabled", "true"));
```

`web/src/pages/EventForm.test.tsx` and `web/src/pages/Login.test.tsx` each have one such test.

- [ ] **Step 1:** `grep -rn 'role="alert"\|ByRole("alert")\|toBeDisabled\|toBeEnabled\|disabled={' web/src` and list every site. Decide per site whether it is a form error (change it) or always-present content / a non-submit control (leave it).
- [ ] **Step 2:** Change the tests first and watch them fail. This is a refactor with existing coverage, so the tests are the specification.
- [ ] **Step 3:** Change the three components.
- [ ] **Step 4:** `npx vitest run && npm run typecheck && npm run lint:js && npm run test:e2e`. The e2e run matters here: `web/e2e/planning.spec.ts` samples frames around the submit button, and `web/e2e/auth.spec.ts` fills forms.
- [ ] **Step 5:** Commit:

```bash
git add web/src
git commit -m "fix(web): announce form errors reliably, and stop disabling the focused button

role=\"alert\" on an element inserted into the DOM is announced by most
browser/AT pairs and missed by some — reliably so when the insertion shares a
commit with other churn, which is exactly when a form error appears. The region
is resident now and only its contents change.

Disabling a focused button drops focus to <body>, so a failed submission could
leave a keyboard user with no feedback and no place in the document. aria-disabled
keeps the control focusable; the submit handler's early return is the real guard.

guards.tsx and SessionProvider.tsx keep their inserted role=\"alert\" — their
content is present from first render, which is the case the insertion problem
does not apply to."
```

---

## Task 10: Full verification and handover

**Files:**
- Modify: `docs/continue-here.md`

- [ ] **Step 1: Run everything**

```bash
npm run check
npm run test:e2e
npm run build
npm run smoke
```

In PowerShell (or with `MSYS_NO_PATHCONV=1` in Git Bash):

```bash
docker compose exec -w /var/www/html/api-laravel web php artisan test
```

Expected: `check` exit 0; 11 e2e passed; the artifact holds both `index.html` and `api-laravel/`; 13/13 smoke; 232 Laravel tests.

`ApiErrorVocabularyTest` is the one to watch in the Laravel suite — it reads `web/src/i18n/fr.ts` directly and fails if any token the API can emit has no French copy.

- [ ] **Step 2: Update the handover**

In `docs/continue-here.md`, replace the "Next: the sixteen routes" paragraph with the state after this chunk: sub-project B done, thirteen routes still `Placeholder`, and A / C / D remaining as listed in the design document. Add any trap this plan cost you.

- [ ] **Step 3: Commit and push**

```bash
git add docs/continue-here.md
git commit -m "docs: auth and contact are ported; thirteen routes to go"
git push
```

---

## Notes for whoever executes this

- **The one thing that silently half-works is the invalidation.** If `getAuthUserQueryKey()` is not invalidated after login, everything looks right — the request succeeds, the navigation happens — and the app stays anonymous until the next full page load. Two tests exist for exactly this: "the session is visible afterwards, with no reload" and the e2e "makes the session live without a reload".
- **Do not reload the document to refresh the session.** `window.location.href` was the old page's mechanism and it is wrong here.
- **`fr.ts` apostrophes are straight, not typographic.** "Nom d'utilisateur", "n'est pas dans un format valide". Copy them from the file.
- **The contact labels have no space before the colon** ("Nom:") while the planning ones do ("Date :"). Both are the live site's. Do not normalise either.
- **`useAuthLogout` takes `void`**, so it is `logout.mutate()` with no argument.
- **Keep the event form's input ids** (`event-title`, `event-startTime`). The e2e frame-sampling test selects them directly.
