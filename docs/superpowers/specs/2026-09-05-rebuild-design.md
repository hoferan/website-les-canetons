# Rebuild design — Les Canetons, from scratch

**Date:** 2026-09-05
**Status:** design approved in session; implementation plan to follow
**Supersedes as the target state:** every spec dated 2026-07-16 … 2026-09-01

This document describes the **should-state** of a from-scratch rebuild, not a
patch to the current tree. The only fixed requirements are: a PHP API backend,
the same MariaDB host, and a React + Tailwind front end.

Read `docs/continue-here.md` for where the *current* implementation stands. This
spec deliberately does not inherit its constraints.

---

## 1. Why rebuild rather than continue

The current tree is a faithful port of a legacy site, and it inherited the
legacy's shape along with its content. Five structural problems, each of which
the port preserved rather than caused:

1. **The priority is inverted.** Nine public pages, read once by a stranger, are
   treated as equal to one members' flow used weekly by ~45 people.
2. **Identity is a dead end.** `users` carries `username`, `password`, `role`,
   `instrument_id` and nothing else. There is no user-management UI and no
   endpoint for one — accounts exist only if someone writes a DB row by hand.
   (`User`'s own docblock refers to "the members' admin UI"; it was never built.)
3. **The role matrix is a hierarchy-shaped trap.** `admin` holds
   `manage_events` + `view_summary` and therefore **cannot answer whether they
   are coming**. `moderator` and `user` hold identical capabilities — the role is
   dead weight. In practice `admin` is a shared, ownerless account.
4. **Content is unmaintainable by the band.** 23 `<Tbd>` fields and 10 missing
   photographs block a PROD deploy, because rosters, committee and instructors
   are hardcoded in `.tsx`. Every yearly turnover is a developer task.
5. **Security is largely absent.** No rate limiting anywhere. No anti-abuse on
   the contact form. No session revocation. No HTTPS redirect or security
   headers in the `.htaccess`. The defence protecting `api-laravel/.env` is a
   single rewrite rule's ordering — see §6.

---

## 2. Decisions taken

| # | Decision |
|---|---|
| D1 | **The members' tool is the product.** The public site is a small, honest brochure. |
| D2 | **Accounts stay username-only** (no email on member records — members are children ~6–16). Account administration happens in a real screen, not in Adminer. |
| D3 | **Existence is the state.** No `active` flag, no seasons, no soft delete. A row exists ⇒ they are in the band. History is explicitly not required. |
| D4 | **Authorization is permission-based.** Permissions are a fixed enum in code; roles are freely-editable data that group them. No `if` anywhere tests a role name. |
| D5 | **No shared or technical accounts.** Every account is a named human. |
| D6 | **Attendance gains** a per-event deadline, a free-text note, and direction-recorded answers. |
| D7 | **Reminders nudge the direction, not the member.** The tool surfaces "who hasn't answered" with the names and a copy button; WhatsApp remains the delivery channel. No cron, no email to minors, no push. |
| D8 | **One roster, two views.** Public "who's in the band" pages are generated from the member roster, gated per member by a `public_visible` consent flag. |
| D9 | **Public registration is a property of an event**, not a separate "souper" feature. |
| D10 | **URLs are English; French is a UI language only.** German can be added later without touching a URL. |
| D11 | **Stay on the shared host, and simplify hard.** No backwards compatibility is owed to anything. |
| D12 | **TEST only.** QA and PROD are out of scope until TEST is real. |
| D13 | **No data migration.** The roster is re-entered by hand; no responses, signups or passwords are carried across. |

### On D7 — the constraint that forced it

SMTP works and is proven in production (`SignupController` sends a confirmation
mail). But there is **no cron and nothing scheduled anywhere** in the project,
and no service worker. The only "run without cron" precedent is
`RunPendingMigrations` piggybacking on an inbound request, which is exactly
wrong for a reminder: a reminder that fires only when someone visits is not a
reminder. Automated member-facing reminders therefore require both a channel
(email on minors, or Web Push) and a trigger (cron) that do not exist. The
direction-facing chase list needs neither and ships in R1.

### On D13 — why no migration is the safer option

History is not required (D3), passwords cannot be carried across a hash change,
and old `signups` rows describe an occasion model that no longer exists.
Re-entering ~45 people by hand is a smaller and more reliable task than a
migration script — and **everyone receiving a fresh personal credential is the
moment the shared-`admin`-account problem is actually solved.** A migration
would carry that problem forward.

---

## 3. Domain model

Twelve tables, on top of Laravel's own `sessions` / `cache` / `jobs`. Every
rename is load-bearing.

### `sections` (was `instruments`)
```
id, name, sort_order
```
`sort_order` because registers have a conventional order on the public page;
today that order is hardcoded in TSX and drifts from the table.

### `members` (was `users`) — the single roster
```
id, first_name, last_name, section_id?,
username?, password_hash?, must_change_password, last_login_at?,
committee_title?, instructor_of_section_id?, public_visible,
created_at, updated_at
```

**A member row is a person, not an account.** `username` / `password_hash` are
nullable, so:

- an instructor listed publicly needs no login;
- a young member whose parent answers needs no login;
- there is nowhere for a shared, ownerless account to live, because every row is
  a named human.

`username` carries a unique index; MariaDB permits multiple NULLs under one.

This table feeds the admin roster, the attendance list, the public band page,
the committee page and the instructor listing. **A person is entered once.**

### `roles`, `role_permissions`, `member_roles`
```
roles              id, key, label_fr
role_permissions   role_id, permission
member_roles       member_id, role_id
```

Permissions are a **fixed PHP enum**, not data:

```
events.manage
attendance.view_all
attendance.record_for_others
members.manage
registrations.view
```

Three properties keep this clean:

1. **Permissions are code; roles are data.** A permission is real only if some
   middleware checks it, so the set cannot be invented in the UI. Roles
   ("direction", "comité") are edited freely by the band.
2. **No direct per-member grants.** Direct grants are what rots RBAC systems —
   "why does she have this?" becomes unanswerable. Permissions arrive *only*
   through roles, so the answer is always "because she is in Team Direction".
3. **Enforcement never sees a role.** Middleware is `permission:events.manage`.
   The string "direction" appears in no authorization decision anywhere.

Effective permissions = union over the member's roles.

**Lockout invariants, enforced in code:**
- the last effective holder of `members.manage` cannot be stripped or deleted;
- nobody can revoke their own `members.manage`, or delete themselves.

**Responding is not a permission.** A member answers for events when they belong
to a register (`section_id` set) — the same single fact the public roster uses.
An instructor with no register is simply not in the attendance list, so no
spurious "sans réponse" appears in any count. This is what dissolves the
admin-cannot-respond bug by construction.

### `events`
```
id, title, starts_at, ends_at, location, attire?,
is_public, attendance_enabled,
registration_opens_at?, registration_closes_at?, registration_max_guests?,
notes?, created_at, updated_at
```

`starts_at` / `ends_at` as datetimes replace `date` + two `TIME` columns **and**
the `weekend` boolean. The current schema cannot express an event crossing
midnight — which, for a carnival Guggenmusik, is most gigs — and `weekend`
exists only to make `EventCard` render a date *range*. Both problems vanish: the
card renders a range when the dates differ.

**Three independent facets**, not three kinds of event:

| Facet | Audience | Controlled by |
|---|---|---|
| Attendance | members, logged in | `attendance_enabled` (default true) |
| Public listing | strangers | `is_public` |
| Registration | anonymous public | `registration_closes_at IS NOT NULL` — no separate flag |

Every real case is expressible:

- rehearsal → attendance ✓, public ✗, registration ✗
- carnival gig → attendance ✓, public ✓, registration ✗
- **souper → attendance ✓, public ✓, registration ✓** (the band plays at it)
- committee meeting → attendance ✗, public ✗, registration ✗

`is_public` also fixes a live defect: today `/planning_repet` is public and
shows **rehearsals** to strangers.

### `attendance` (was `responses`)
```
id, event_id, member_id, status ∈ {yes,no}, note?,
recorded_by_member_id?, created_at, updated_at
UNIQUE(event_id, member_id)
```

`recorded_by_member_id` is null when self-answered and set when the direction
answered on someone's behalf, so the UI can say *"réponse saisie par la
direction"* rather than implying the member replied. `ON DELETE CASCADE` from
both `events` and `members`.

### `event_registration_options`, `registrations`, `registration_choices`
```
event_registration_options  id, event_id, label, description?, price_display, sort_order
registrations               id, event_id, first_name, last_name, email, phone?,
                            address?, table_name?, created_at
registration_choices        registration_id, option_id, quantity
```

This generalises the souper. Today `signups.menus` is already a per-guest list
of choices (`meat`/`child`/`vegetarian`, capped at `MAX_GUESTS`) plus a
`table_name` for seating — so the step is small. What disappears entirely:
`Occasion` with its MENU_VALUES / MENU_LABELS / MENU_INFO lockstep problem,
`ACTIVE_OCCASION`, `SOUPER_SIGNUP_ENABLED`, `EnsureSouperSignupEnabled`, and the
conditional route registration in both `api.php` and `routes.tsx`. **Next
year's souper becomes a form the committee fills in, not a deploy.**

`price_display` is a pre-formatted string (`CHF 45.–`); currency formatting stays
beside the description it belongs with.

### `contact_messages`
Shape unchanged. Gains anti-abuse and actually mails the committee — today
nothing ever reads that table.

### `audit_log`
```
id, actor_member_id, action, target_type, target_id, created_at
```
Privileged mutations only: member created/deleted, role changed, password reset,
event deleted. This does not contradict D3 — that concerns *attendance* history.
This is a security control, and it is what makes "why does this person have
access?" answerable.

---

## 4. URL structure and screens

URLs are **resource-oriented**. There is deliberately no `/admin` or `/manage`
namespace: under real RBAC there is no single privileged area — `events.manage`
and `members.manage` are different people, and a namespace named after a
permission level is a lie about the model. Navigation still groups Direction
screens under one heading; nav grouping and URL structure are different
problems, and only one has to encode authorization.

```
/                          home                          public
/events                    the planning                   public, filtered by identity
/events/new                                               events.manage
/events/:id                                               public, filtered
/events/:id/edit                                          events.manage
/events/:id/attendance     who is coming, who has not     attendance.view_all
/events/:id/registrations  guest list + export            registrations.view
/members                   the roster                     members.manage
/account                   change own password            any account holder
/band                      generated from the roster      public
/committee                 generated from the roster      public
/join                                                     public
/history                                                  public
/contact                                                  public
/login                                                    public
```

Because `/events` varies by identity, **every identity-dependent API response
must send `Cache-Control: no-store`**, or a shared proxy can serve a member's
view to an anonymous visitor. The current split-by-page design avoided this bug
by accident; the new one must avoid it on purpose.

No legacy redirects (D11). Old URLs fall through to the SPA's 404 view, as every
unknown path already does.

### The four interactions that decide whether this is used

1. **Answering is one tap, from the list, without navigating.** The product is a
   13-year-old on a phone on a bus. Two ≥44px targets per unanswered event,
   optimistic update, no page change, immediately undoable. A note expands in
   place and never gates the answer.
2. **The list is ordered by urgency, not date.** An **"À répondre"** block pins
   unanswered upcoming events to the top, deadline-first; the planning follows
   chronologically. This is why `/inscriptions_utilisateurs` existed as a second
   page — under this design **that page disappears**: "my answers" is the top of
   the one screen.
3. **The direction's screen is a chase list, not a report.** Headline counts
   (`24 oui · 3 non · 9 sans réponse`), then **the 9 names**, then one button
   that copies them for WhatsApp. Cards grouped by register on phones; the table
   appears only ≥768px. Today `InscriptionsAdmin` renders a `<Table>` that
   scrolls horizontally at 390px and answers "who said yes" when the real
   question is "who must I still chase?".
4. **Passwords have a human path.** `members.manage` opens a member and hits
   "Réinitialiser le mot de passe"; a generated password is shown **once**, to
   read out or hand over. The next login forces a change
   (`must_change_password`). No email, no token mail, no DB surgery — and no
   administrator who knows anyone's password.

### Deliberate absences
- No destructive action without naming the damage
  ("Supprimer Léa Rossier — 3 réponses à venir seront effacées").
- No bare tables on phones.
- No nav entry a member cannot use — the Direction group is absent, not refused.
- No page whose only content is a link. (That already killed `/admin` and
  `/sinscrire`.)

---

## 5. Public site

Eight pages, down from twelve; navigation from ten items to five.

| Path | Source |
|---|---|
| `/` | authored |
| `/events` | DB — public events only for anonymous visitors |
| `/band` | **generated** from `members` where `public_visible`, grouped by section, instructors included per register |
| `/committee` | **generated** from members holding a committee title |
| `/join` | authored |
| `/history` | authored |
| `/contact` | form |
| `/login` | — |

The `<Tbd>` / `<PhotoPending>` problem is not solved, it **stops existing**:
there is no placeholder because people-data comes from the roster, and a section
with no members renders nothing rather than a dashed box. The content gate that
currently blocks a PROD deploy disappears with the architecture.

**Content change on safety grounds:** the three published personal mobile
numbers are removed. The 2026-08-31 audit flagged all three as possibly the
wrong people — both "joining" contacts are the pair who handed over the
direction. `/join` links to `/contact` instead.

**i18n:** French is the only bundle at launch; German drops in as a second
bundle with no URL change. Stated tradeoff: search engines index the French
rendering only, since there is no per-language URL. For a Fribourg band this is
the right trade.

**Kept:** the image budget (longest edge 1920px, 600 KB, exemptions by name,
enforced by `tools/image-budget.mjs` in `npm run check`).

**Dropped:** `/cd`, `/multimedia`, `/sponsors` and their images.

---

## 6. Security

### Gaps in the current implementation

| | Status |
|---|---|
| Login rate limiting | **none anywhere in the codebase** |
| Contact form anti-abuse | **none** (the souper form has Altcha; contact has nothing) |
| Session revocation on delete / password change | **none** — a deleted member stays logged in |
| HTTPS redirect | **absent from the `.htaccess`** |
| Security headers (CSP, X-Content-Type-Options, Referrer-Policy, X-Frame-Options) | **none** |

### The `api-laravel/.env` exposure — and the fix

`staging/README.md` documents two tracked `.htaccess` files intended as defence
in depth: `api/.htaccess` denying the whole Laravel tree, and
`api/public/.htaccess` re-granting the one reachable directory.

**Neither has ever reached a server.** `tools/deploy/preflight.mjs` protects the
basename `.htaccess` *at any depth*, so both are silently dropped from every
upload while `tools/build.mjs` copies them into `dist/build/`. The README
justifies this as redundant. It is not redundant — it is the second layer, and
today the only thing between the internet and `api-laravel/.env` is one rewrite
rule's ordering.

Relocating the Laravel tree outside the document root is **impossible**: the FTP
account is chrooted to the web root. The fix is therefore:

1. **Make the protected set path-based, not basename-based** — protect exactly
   `/.htaccess`, `/robots.txt`, `/api-laravel/.env`. The nested `.htaccess`
   files then deploy like any other file.
2. **Write the deny block version-agnostically**, because the host's Apache
   version is unresolved (it 500s on `<RequireAny>`, which leans 2.2, and
   `Require all denied` is 2.4-only):
   ```apache
   <IfModule mod_authz_core.c>
     Require all denied
   </IfModule>
   <IfModule !mod_authz_core.c>
     Order allow,deny
     Deny from all
   </IfModule>
   ```
3. **Keep the SPA catch-all** with its `REDIRECT_STATUS` guard — but only as
   routing, never as the security boundary. (The `!-f`/`!-d` alternative is what
   500-looped on this FastCGI host.)
4. **Add a smoke check** fetching `/api-laravel/.env` and asserting it is not
   served, so this cannot silently regress again.

### Auth

Cookie-based session auth is kept — not because it is the incumbent, but because
it is correct here. A token in `localStorage` is strictly worse: any XSS reads
it and it cannot be revoked server-side. `HttpOnly` cookies are unreadable by
script, and since the SPA and API are same-origin there is no cross-origin case
to solve.

**Sanctum itself is a candidate for removal.** It exists for an SPA on a
*different* origin and for API tokens for third-party clients; neither applies.
What is actually needed from it is one endpoint that plants a CSRF cookie — only
necessary because the SPA shell is a static file with no Blade template to carry
a meta tag. Removing the package drops `personal_access_tokens`, the
stateful-domains config, and a class of "why is this 419" confusion.
**This is the one item marked *probable* rather than settled: prototype before
committing.**

### The posture to build to

- **Sessions:** DB-backed; `Secure`, `HttpOnly`, `SameSite=Strict`; idle *and*
  absolute lifetime.
- **Passwords:** argon2id. A fresh member table means no legacy-hash migration,
  which also deletes `AuthController::storedPasswordIsNotBcrypt()` — a branch
  that exists only to stop a 500 on unconverted legacy rows.
- **Revocation is immediate.** Deleting a member, changing their password or
  revoking a role deletes that member's `sessions` rows in the same transaction.
  **Without this, hard-delete is theatre** — a deleted member currently stays
  logged in until their session expires.
- **Throttling:** login (per username *and* per IP, with backoff and lockout),
  contact, public registration.
- **Anti-abuse:** honeypot + submit-timing + Altcha, applied generically to both
  public write endpoints. The Altcha implementation exists and works; it only
  needs to stop being souper-specific.
- **Re-authentication** before destructive privileged actions. Whoever holds
  `members.manage` can lock the band out; re-entering their own password is
  proportionate for this audience, TOTP is not.
- **Audit log** of privileged mutations (§3).
- **Transport:** force HTTPS, HSTS, and the four security headers, in the
  `.htaccess` template.

---

## 7. Infrastructure

Same host, same FTP, same MariaDB, PHP 8.4, MariaDB 10.3.

### Deleted

1. **Every legacy `RedirectMatch`.** These caused both documented outages — the
   `.php` rule 301'ing the API's own rewrite target so *the entire API answered
   301*, and the `.html` rule 301'ing the SPA fallback's own output into a
   site-wide redirect loop. Both were patched with negative lookaheads; the
   lookaheads are the smell. With no backwards compatibility owed (D11) the
   rules go entirely, and both outages become structurally impossible rather
   than defended against.

   What remains in `.htaccess`: HTTPS + HSTS + headers, the two `/api`
   `/sanctum` dispatch lines, the SPA fallback, cache policy.

2. **`RunPendingMigrations`.** A failed migration currently 503s every `/api/*`
   request and retries on each one; a long `ALTER` holds a PHP-FPM worker into
   `max_execution_time` and half-applies. Migrations become a deliberate step:
   the token-gated `POST /api/migrate` — which already exists and is the right
   mechanism — run *before* the deploy that needs it, folded into the deploy
   command with a confirmation.

3. **QA and PROD tooling** (D12): `deploy-qa.yml`, `deploy-prod.yml`, the
   Deployments-API "must have passed QA" check, two credential sets, two
   `.env.*` files, and the QA/PROD sections of `staging/README.md`. QA has never
   been deployed once in this project's history, while `deploy-prod.yml` refuses
   any commit QA has not taken — so the safeguard is currently the thing
   blocking all releases and has never once been satisfied. One environment, one
   workflow, one target.

4. **Product-level deletions:** Sanctum + `personal_access_tokens` (pending the
   prototype), `SOUPER_SIGNUP_ENABLED` + `EnsureSouperSignupEnabled` +
   `Occasion`, the `role` enum, `moderator`, the `weekend` flag, the `occasion`
   string, `AuthController`'s legacy-plaintext branch, `Tbd` +
   `PhotoPending`, `/cd` `/multimedia` `/sponsors` and their images,
   `/inscriptions_utilisateurs`, the three published phone numbers.

### Kept, because they earn their complexity

The sha256-diffing FTP mirror, `.sync-state.json`, the mass-delete safety brake,
the config-shape preflight, the image budget, the OpenAPI drift check, the
generated orval client, TEST's HTTP Basic Auth, the `deployment.json` marker.

### Out of scope

Database backups. The user takes a manual backup before any QA or PROD deploy.

---

## 8. Release slicing

| | Ships | Rationale |
|---|---|---|
| **R1 — the tool** | members + roles/permissions, hardened auth, events with the three facets, attendance (note, deadline, on-behalf), the chase list, `/account`. Public: `/`, `/events`, `/login`, `/contact`. | The band gets a working tool. Nothing here waits on a content decision the committee has not made. |
| **R2 — the public face** | `/band` and `/committee` generated from the roster; `/join` and `/history` authored; navigation and home finished. | Depends on R1's roster existing. This is what makes a public deploy defensible. |
| **R3 — registration** | event registration options, public form, guest list + export, confirmation mail. | Needed once a year. Built after the tool works, not before. |

R1 + R2 together replace the entire current site. R3 replaces the souper.

---

## 9. Open items

1. **Sanctum removal** — prototype the plain-session + CSRF-cookie approach
   before committing to it (§6).
2. **Apache version on the host** — unresolved. The version-agnostic deny block
   (§6) is written not to depend on the answer, but the answer is worth having.
3. **Roster data** — ~45 members must be re-entered by hand (D13). The band
   must supply the current roster, registers, committee titles and instructor
   list, plus a per-person decision on `public_visible`.
4. **The 2026-08-31 content audit's authored-prose questions** remain open for
   `/history` and `/join` (section 3 of `docs/content-audit-2026-08-31.md`).
   They no longer block anything structural, because the people-pages are now
   generated.
