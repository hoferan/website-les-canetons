# Auth and contact — design

**Date:** 2026-08-29
**Branch:** `feat/spa-cutover`
**Status:** approved, ready for a plan

This is sub-project **B** of four that between them port the sixteen routes
still rendering `Placeholder`. The decomposition, agreed 2026-08-29:

| | Routes | Blocked on |
| --- | --- | --- |
| A. Content pages | accueil, historique, canetons, cd, commencement, moniteurs, sponsors, multimedia, comite_teamdirection | nothing |
| **B. Auth + contact** | **authentification_inscription, contact, confirmation** | **nothing — this document** |
| C. Members' area | sinscrire, inscriptions_utilisateurs, admin, inscriptions_admin | the broken `GET /api/responses` type |
| D. Souper | signup, signup_thanks, signups_admin | the broken `GET /api/signups` type |

B is first because **the login page is the keystone**. Nothing gated is
reachable in the real app without it: `RequireAuth` redirects to a placeholder,
and `web/e2e/planning.spec.ts` fakes a session by POSTing `/api/login` from
`page.evaluate` — a stopgap its own comment says to remove once this route
exists. Every page in C and D needs a way to sign in before it can be tested by
hand.

## What is being ported

The parity references are `git show dcd7862^:app/pages/<page>.php` and the same
commit's `app/assets/js/`. The live site is the other reference.

### 1. `/authentification_inscription` — `web/src/pages/Login.tsx`

**One route, two states.** The old site had no logged-in state for this URL at
all; logout was a button on `/admin`, which belongs to chunk C. Without
something here there would be **no way to end a session anywhere in the SPA**
— you could log in as `demo.admin` and never get back to `demo.user` without
clearing cookies by hand.

**Anonymous** reproduces the old form exactly:

- `<h2>` "Authentification"
- `Identifiant :` — text, required
- `Mot de passe :` — password, required
- submit "Se connecter"

**Logged in** shows "Connecté en tant que *username*" and a **Se déconnecter**
button.

`web/src/components/Layout.tsx` already routes its auth nav item here and
already shows `user.username` when there is a session, so the navigation needs
no change: the item simply becomes a link to an account page rather than to a
login form.

#### After a successful login, invalidate — do not reload

The old handler ended with `window.location.href = returnToPage`, a full
document load, because the destination page read the role from a server-rendered
`window.__sessionRole`. **The SPA must not do that.** A reload discards the
router, the Query cache and the whole application instance to learn one fact.

Instead: invalidate `getAuthUserQueryKey()` and navigate with the router.
`SessionProvider` holds `useAuthUser` at `staleTime: Infinity`, so invalidation
is what makes the new session visible; nothing else will.

`getConfigQueryKey()` is deliberately **not** invalidated. `GET /api/config`
carries the environment, the feature flags and the occasion copy — none of it
user-dependent. The plan verifies that claim against `ConfigController` before
relying on it; if it turns out to vary by user, invalidate both.

#### Failure is inline, not `alert()`

`authentification-inscription.js` ended in
`alert("Nom d’utilisateur ou mot de passe incorrect")`. The port renders that
message inline in a `role="alert"`, computed by `translateApiError` from the
API's `invalid_credentials` — a token already present in `web/src/i18n/fr.ts`.

This is a **deliberate parity break**, the same kind as `EventActions` turning
the old click-handling `<span>`s into real buttons: `alert()` is modal, unstyled,
dismissible only by acknowledgement, and on mobile reads as a browser warning
rather than as part of the site.

A failed login must **not** navigate. The submit button is disabled while the
request is in flight and re-enabled when it settles either way.

### 2. `returnTo`, as router state

`RequireAuth` and `RequireCapability` currently bounce anonymous visitors to
`/authentification_inscription` and forget where they were going. The old site
did not: it appended `?returnTo=` and the login page sent you back.

The port restores that through **router state** — `state={{ from: location }}`
on the `<Navigate>` — not a query parameter.

`authentification-inscription.js` needed an open-redirect guard (resolve against
`window.location.origin`, keep the result only if the origin matches) because
`returnTo` was an attacker-suppliable *URL* in a link anyone could send. Router
state is set by this application and never appears in a URL, so that class of
attack does not arise.

One helper, `safeReturnTo(raw)`, still normalises both the router state **and**
any legacy `?returnTo=` query — the latter so links already in the wild keep
working. It accepts only a value whose first character is `/` and whose
second is neither `/` nor `\` — which rejects `//evil.com`, `/\evil.com`,
`https://…` and `javascript:` alike — and falls back to `/`. The backslash case
is not paranoia carried over for its own sake: browsers normalise `\` to `/`
inside a URL, so `/\evil.com` is protocol-relative to anything that hands it to
`location`. `navigate()` would treat it as an in-app path rather than follow it
off-site, so this is defence in depth rather than the live hole the old page
had.

### 3. `/contact` — `web/src/pages/Contact.tsx`

Five fields, in the old page's order, with its labels:

| Label | Name | Control |
| --- | --- | --- |
| `Nom:` | `lastName` | text |
| `Prénom:` | `firstName` | text |
| `E-mail:` | `email` | email |
| `Sujet:` | `subject` | text |
| `Contenu du message:` | `message` | **textarea** |

Submit reads "Envoyer". Success navigates to `/confirmation`, as
`contact.js` did with `window.location.href`. Failure renders inline, per field,
exactly as the event form does — every one of `lastName`, `firstName`, `email`,
`subject` and `message` is already in `fr.ts`.

The form **keeps its values on failure**, like `EventForm`: a rejected contact
message must not make someone retype it.

#### `Sujet` becomes required, and that is a bug fix

The old markup marked every field `required` **except** `subject` —

```html
<label for="subject">Sujet:</label>
<input type="text" id="subject" name="subject" />
```

— while `api/app/Http/Requests/ContactRequest.php` requires it:

```php
'subject' => ['required', 'string', 'max:255'],
```

So today a blank subject passes browser validation, makes a round trip, is
rejected, and `contact.js`'s `alert("Échec de l’envoi du formulaire")` hides the
reason. The port marks it `required`, matching the API, so the browser catches
it with no round trip. (Approved explicitly; the alternative considered was
leaving it optional and letting the new inline "Sujet est requis" explain the
rejection.)

The old form posted `FormData`; the generated client posts JSON. Laravel's
`FormRequest` accepts either, so this is not a behaviour change.

### 4. `/confirmation` — `web/src/pages/Confirmation.tsx`

Static, twelve lines in the original:

- `<h2>` "Formulaire envoyé avec succès !"
- "Merci d'avoir rempli le formulaire. Vous recevrez bientôt un e-mail de confirmation."

It is in this chunk rather than chunk A because it is the contact form's success
destination: without it, contact has nowhere to go.

## The extraction

`Contact` is the **second** consumer of the `{error, code, fields[]}` → French
pattern, and chunks C and D bring at least three more. It comes out of
`EventForm` now, and `EventForm` is refactored onto it **in the same change** —
an abstraction with one consumer proves nothing about its shape.

Two pieces, both small and both with one job:

**`useApiFormError()`** owns the part that is easy to get wrong:

- narrowing with `instanceof ApiError` — the generated hooks type `TError` as the
  *declared* error models, but the mutator always throws an `ApiError`, so the
  declared type must never be trusted here;
- the generic French fallback for anything that is not an `ApiError` (an HTML 502
  from the host, say);
- `messageFor(field)`.

It exposes `{ error, setFromThrown, clear, messageFor }`.

**`FormField`** renders one labelled control and owns the accessibility wiring
that is otherwise copy-pasted per input: the `<label htmlFor>`, the control, and
when there is a problem the `aria-invalid`, the `aria-describedby`, the error
`<span id>` and the error border. It supports `<textarea>` as well as `<input>`,
because the contact form needs one.

Neither hides the mutation, the submit handler or the page's own layout. The
double `.data` stays visible at call sites, for the reason recorded in
`docs/continue-here.md`.

## Testing

**Unit (Vitest + MSW), per page.** The behaviours that must be pinned:

- a successful login makes the session visible **without a reload**, and
  navigates;
- a failed login shows the French message and **does not navigate**;
- the submit button is disabled in flight and re-enabled either way;
- an already-authenticated visitor gets the logout view, not the form;
- logout clears the session;
- `returnTo` is honoured, and a hostile value (`//evil.com`) falls back to `/`;
- contact success navigates to `/confirmation`;
- a contact validation error renders French messages against the offending
  inputs, with `aria-invalid`, and keeps what was typed.

**The mocks need a hand-written `POST /api/contact`.** Only the generated
catch-all covers it today, and a generated handler cannot be made to fail on
demand. It goes in `web/src/mocks/handlers.ts` beside the other four
hand-written endpoints, and mirrors the API's authorisation and shape.

**End-to-end.** `web/e2e/planning.spec.ts`'s `login()` helper stops POSTing to
`/api/login` from `page.evaluate` and fills the real form instead — the change
its own docblock anticipates. One new spec covers logging in through the UI and
seeing the planning page's admin form appear.

**Against the real API.** As with `/planning_repet`, the mocks cannot prove the
contract. The plan ends with a pass against the dev stack: log in as each of the
three seeded accounts, log out, send a contact message and confirm the row
lands in `contact_messages`, and submit an invalid one to see the French field
errors come from Laravel rather than from a mock.

## Out of scope

- The `/admin` logout button — chunk C. This chunk gives logout a home in the
  meantime; when `/admin` is ported it gains its own button and this one stays.
- Anything souper — chunk D.
- Registration. The route is named `authentification_inscription`, but the old
  page had no sign-up form: accounts are created by hand in the database. The
  name is a historical URL, frozen like every other.
- `GET /api/responses` and `GET /api/signups` typing — the plans for C and D.

## Risks

- **Invalidation, not reload, is the one thing that can silently half-work.** If
  `getAuthUserQueryKey()` is not invalidated, login appears to succeed and the
  app stays anonymous until the next full page load — which is exactly the sort
  of bug the old `window.location.href` masked. A unit test asserts the session
  is visible after login with no reload.
- **`translateApiError` must have every token.** Any error the login or contact
  endpoints can emit needs French copy in `fr.ts`, or the display layer falls
  back to a generic message. `api/tests/Feature/ApiErrorVocabularyTest.php`
  enforces this; the plan runs the Laravel suite.
- **Refactoring `EventForm` while porting two new pages** risks regressing a
  page that currently works. Its unit suite and the planning e2e specs run
  unchanged; if the extraction requires editing an existing `EventForm` test,
  that is a signal the abstraction changed behaviour and should be reconsidered.
