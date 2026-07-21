# API error responses: English wire format + frontend translation

**Date:** 2026-07-21
**Status:** Approved (design)

## Problem

`CLAUDE.md`'s Language rule currently states that error messages shown to
the user are French — the same category as page labels and buttons — and
every `app/api/*.php` endpoint follows that faithfully today (e.g.
`"Méthode non autorisée"`, `"Accès refusé"`, `"Événement introuvable"`).

The maintainer has decided this should change: API JSON error responses
must be English on the wire, with French shown to end users only through a
frontend translation layer — not baked into the API. Alongside that, the
maintainer wants richer per-field validation detail than today's "first
invalid field wins, generic message" behavior, so the UI can tell a user
*which* field is wrong and *why*, and highlight/focus it — not just show
one generic "form invalid" message per submission.

This spec is the API-error/i18n piece only. Two adjacent, larger ideas came
up during design and were deliberately deferred as separate future
initiatives (see Non-goals): introducing a frontend build system, and a JS
test framework. Building either as a side effect of this work would block
the actually-requested fix behind an unrelated infrastructure migration.

## Decision

- Extend the existing `App\Http\JsonResponse` helper (`app/src/Http/JsonResponse.php`,
  built in the prior remediation effort) with a machine-readable `code`
  and, for validation failures, a `fields` array of
  `{field, reason, params?}` entries — all English snake_case identifiers.
- Introduce one DTO class per multi-field form (`App\Dto\EventInput`,
  `ContactInput`, `SignupInput`, `LoginInput`, `ResponseInput`), each
  validated by a small **hand-rolled**, PHP-attribute-based validator
  (`App\Validation`) — not a Composer validation library. Considered and
  rejected symfony/validator: its violation messages/parameters are
  English prose + Symfony-specific placeholder syntax designed for
  `symfony/translation`, not a stable small vocabulary a separate frontend
  i18n system can key off — adapting them would cost roughly the same code
  as validating directly, while adding a real dependency and coupling the
  wire format to Symfony's internals. A small in-house validator is easy to
  rework later if a framework is ever adopted.
- Validation moves from "stop at the first invalid field" to "check every
  field, report every failure in one response."
- Vendor i18next (browser build, static file — same pattern as
  `app/assets/vendor/bulma.min.css`) and add `app/assets/js/i18n.js`
  initializing one French resource bundle. This is deliberately a real,
  general-purpose i18n library, not a bespoke lookup table, because the
  maintainer expects to introduce broader i18n later regardless of this
  feature.
- Only the one JS call site that currently displays an API error to a user
  (`planning_repet.js`'s admin event-save flow) gets wired to consume and
  translate the new response shape. Every other endpoint's response is
  enriched the same way, so any future call site can adopt the same
  `translateApiError()` helper with zero further API changes — but no other
  JS is touched by this work.

## Goals

1. Every `app/api/*.php` endpoint except `migrate.php` (see Non-goals)
   returns an English `error` message and a stable `code` — no French text
   anywhere in a JSON response body.
2. Validation-type failures report every invalid field in one response
   (`fields: [{field, reason, params?}, ...]`), not just the first.
3. A complete French translation dictionary exists for every `code`,
   `reason`, and form field name introduced by this work, even though only
   one call site consumes it today.
4. `planning_repet.js`'s admin event-save error handling shows
   field-specific, translated messages and highlights/focuses the actual
   invalid field(s), replacing today's single generic message.
5. `CLAUDE.md`'s Language section is updated to state the new rule
   precisely (API JSON bodies are English; page-level HTML/UI text is
   unchanged/French; translation happens at the JS display layer).
6. The validation engine (DTOs + attributes + `Validator`) is pure PHP,
   unit-testable without a database, adds no new Composer dependency, and
   is swappable later without changing the wire contract or any consumer.

## Non-goals

- **No frontend build system.** `CLAUDE.md` already documents this as
  buildless by design ("no bundler — a JS/CSS build pipeline is a separate,
  later roadmap item"); this work stays inside that constraint. Introducing
  Vite/esbuild/etc. is real, disruptive, cross-cutting work (deploy
  pipeline, `npm run build`, dev server, every existing JS file) and
  deserves its own brainstorm when the maintainer is ready for it.
- **No JS/TS test framework.** Depends on the build-system decision above
  (module bundling/TS transpilation); designing it before that exists means
  redesigning it immediately after. Deferred alongside the build system.
- **No wiring of other JS call sites.** Login, contact, signup, and RSVP
  JS keep today's behavior (console-only logging or a hardcoded fallback
  message). Their API responses are enriched by this work regardless, so
  adopting the same translation helper later needs no further backend
  change — but that adoption itself is out of scope here.
- **No Composer validation library.** Explicitly considered and rejected
  in favor of a small hand-rolled validator (see Decision).
- **No HTTP status code changes.** Only response *bodies* change.
- **No multi-locale UI selection.** i18next is configured with a single
  `fr` resource bundle; English is the wire format, not a selectable
  display language. The mechanism doesn't preclude adding locales later,
  but nothing about this work requires it.
- **No change to `app/api/migrate.php`.** It already returns English
  (`"Method not allowed"`, `"Unauthorized"`) and is a token-gated
  deploy-tooling endpoint, never seen by an end user.
- **No change to page-level HTML/UI text.** Every `app/pages/*.php`
  template's French labels, buttons, and copy are untouched.

## Architecture

### `JsonResponse` extension

```php
final class JsonResponse
{
    public static function errorBody(string $message, string $code, ?array $fields = null): string { /* ... */ }
    public static function error(int $status, string $code, string $message, ?array $fields = null): never { /* ... */ }
    public static function methodNotAllowed(): never { /* calls error(405, 'method_not_allowed', 'Method not allowed') */ }
}
```

Wire shape for a validation failure:

```json
{
  "error": "Invalid form submission",
  "code": "validation_failed",
  "fields": [
    { "field": "date", "reason": "required" },
    { "field": "email", "reason": "too_long", "params": { "max": 255 } }
  ]
}
```

Wire shape for a non-validation failure (unchanged shape, English text):

```json
{ "error": "Event not found", "code": "event_not_found" }
```

### Error code & reason taxonomy

**Top-level `code`** (one per response): `validation_failed`,
`method_not_allowed`, `not_authenticated`, `access_denied`,
`invalid_credentials`, `event_not_found`, `invalid_session`,
`service_unavailable`, `captcha_failed`.

**Per-field `reason`** (only inside `fields[]`, only when `code` is
`validation_failed`): `required`, `too_long`, `invalid_format`,
`invalid_type`, `invalid_value`.

**Security rule:** `invalid_credentials` (wrong username/password) is
*always* code-only, never a `fields` entry — it must not reveal which of
username/password was wrong. Only presence/shape problems get field-level
detail. Auth and business-logic failures (`not_authenticated`,
`access_denied`, `event_not_found`, `invalid_session`, `captcha_failed`,
`service_unavailable`) are likewise always code-only.

### DTOs and the hand-rolled validator

Four attribute classes to start, each a plain PHP 8 attribute under
`App\Validation`:

```php
#[Attribute] final class Required {}
#[Attribute] final class MaxLength { public function __construct(public readonly int $limit) {} }
#[Attribute] final class EmailFormat {}
#[Attribute] final class OneOf { public function __construct(public readonly array $choices) {} }
```

One DTO per multi-field form, properties typed `mixed` (not their "real"
type):

```php
namespace App\Dto;
use App\Validation\{Required, MaxLength};

final class EventInput
{
    public function __construct(
        #[Required] public readonly mixed $date,
        #[Required] public readonly mixed $title,
        #[Required] public readonly mixed $startTime,
        #[Required] public readonly mixed $endTime,
        #[Required] public readonly mixed $location,
        #[MaxLength(255)] public readonly mixed $attire,
        public readonly mixed $weekend = false,
    ) {}
}
```

**Why `mixed`, not `string`:** if a property were natively typed `string`
and the request sent a JSON array for that field — exactly PR2 Task 7's
original bug — PHP throws an uncaught `TypeError` *during construction*,
before validation ever runs, recreating the crash-instead-of-400 problem
this whole effort exists to close. Keeping properties `mixed` and checking
shape via attributes (a `TypeString`-style check, or `Required` treating a
non-string/non-scalar as unmet) means a wrong-type value becomes a normal
validation failure (`reason: invalid_type`), never a fatal.

```php
namespace App\Validation;

final class Validator
{
    /** @return array<int, array{field: string, reason: string, params?: array}> */
    public static function validate(object $dto): array
    {
        $errors = [];
        foreach ((new \ReflectionClass($dto))->getProperties() as $prop) {
            $value = $prop->getValue($dto);
            foreach ($prop->getAttributes() as $attr) {
                $result = self::check($attr->newInstance(), $value);
                if ($result !== null) {
                    $errors[] = ['field' => $prop->getName(), ...$result];
                    break; // one reported failure per field is enough
                }
            }
        }
        return $errors;
    }

    /** @return array{reason: string, params?: array}|null */
    private static function check(object $constraint, mixed $value): ?array
    {
        return match (true) {
            $constraint instanceof Required => self::checkRequired($value),
            $constraint instanceof MaxLength => self::checkMaxLength($value, $constraint->limit),
            $constraint instanceof EmailFormat => self::checkEmail($value),
            $constraint instanceof OneOf => self::checkOneOf($value, $constraint->choices),
            default => null,
        };
    }
    // checkRequired/checkMaxLength/checkEmail/checkOneOf: each returns
    // null (passes) or ['reason' => ..., 'params' => [...]] (fails).
    // MaxLength's own $limit becomes params: {max: $limit} directly —
    // no separate mapping table, since Validator owns both ends.
}
```

`params` comes straight from the attribute that failed; there is no
Symfony-style adapter step because we control the full pipeline.

### Endpoint rewiring

DTO + `Validator::validate()` (multi-field forms, collect-all-errors):

| Endpoint | DTO | Notes |
|---|---|---|
| `POST/PUT /api/events` | `EventInput` | Replaces PR2 Task 7's stop-at-first loop. |
| `POST /api/contact` | `ContactInput` | Replaces PR2 Task 8's combined `if`. |
| `POST /api/signups` | `SignupInput` | Replaces its combined `if`. |
| `POST /api/login` | `LoginInput` | Only the *presence* check (missing username/password) goes through the DTO; the wrong-credentials check stays a separate, code-only `invalid_credentials` response per the security rule above. |
| `POST /api/responses` | `ResponseInput` | Covers `eventId`/`participation` shape. |

Single-parameter checks that don't warrant a whole DTO (called directly via
`JsonResponse::error()` with a one-entry `fields` array, no DTO class):
`DELETE /api/events`'s `?id=` and `GET /api/responses`'s `?eventId=`.

Code-only, unchanged shape otherwise: `JsonResponse::methodNotAllowed()`
(all endpoints), `Auth::requireLogin()`/`requireCapability()`
(`not_authenticated`/`access_denied`), `responses.php`'s
`event_not_found`/`invalid_session`, `signups.php`'s `captcha_failed`,
`altcha.php`'s `service_unavailable`.

### Frontend: i18next + translation

- `app/assets/vendor/i18next.min.js` — curl'd browser build, documented in
  `app/assets/vendor/README.md` next to the existing `bulma.min.css` entry
  (library, version, source URL, refresh command).
- `app/assets/js/i18n.js` — loaded on every page in the same script-tag
  slot as `main.js` (before any consumer script). Initializes i18next with
  one `fr` resource bundle, three namespaces:

  ```js
  {
    fr: {
      translation: {
        errors: {
          validation_failed: "Le formulaire contient des erreurs.",
          method_not_allowed: "Méthode non autorisée",
          event_not_found: "Événement introuvable",
          not_authenticated: "Non authentifié",
          access_denied: "Accès refusé",
          invalid_credentials: "Nom d'utilisateur ou mot de passe incorrect",
          invalid_session: "Session invalide",
          service_unavailable: "Service indisponible",
          captcha_failed: "Vérification anti-robot échouée, veuillez réessayer.",
        },
        validation: {
          required: "est requis",
          too_long: "est trop long (maximum {{max}} caractères)",
          invalid_format: "n'est pas dans un format valide",
          invalid_type: "a un type invalide",
          invalid_value: "doit être l'une des valeurs suivantes : {{allowed}}",
        },
        fields: {
          date: "Date", title: "Titre", startTime: "Heure de début",
          endTime: "Heure de fin", location: "Lieu", attire: "Tenue",
          lastName: "Nom", firstName: "Prénom", email: "E-mail",
          subject: "Sujet", message: "Message", username: "Identifiant",
          password: "Mot de passe", eventId: "Événement",
          participation: "Participation",
        },
      },
    },
  }
  ```

- `translateApiError(body)` (in `i18n.js`, exported alongside the init
  code): given a parsed error response body, returns either a general
  translated message (`i18next.t('errors.' + body.code)`) or, when
  `body.fields` is present, a list of `{field, message}` pairs built from
  `i18next.t('fields.' + field) + ' ' + i18next.t('validation.' + reason, params)`.
  Any lookup miss (unknown code/reason/field) falls back to a generic
  `"Une erreur est survenue. Veuillez réessayer."` — i18next's native
  behavior of returning the raw key on a miss is explicitly overridden so
  no English/raw key ever reaches a user.

### `planning_repet.js` consumption (the one wired call site)

Replaces the current `showFormError(error.message)` catch handler:

- If `body.code === 'validation_failed'` and `body.fields` is present: for
  each `{field, reason, params}`, add a `.field-error` class to
  `#event-${field}` and call `.focus()` on the first one; join each field's
  translated message (via `translateApiError`) into the existing
  `#event-error` element.
- Otherwise: show `translateApiError(body)`'s general message in the same
  element, exactly like today, just translated instead of hardcoded.

The frontend's own data model stays English throughout — it parses the
JSON as-is (`{code, fields: [{field, reason, params}]}`), uses the English
`field` name directly as a DOM id lookup key, and only calls into i18next
at the point of building display text. Nothing English is ever stored as
if it were French, and nothing French is computed anywhere except inside
`translateApiError`.

## Testing

- **PHP:** `Validator` and each attribute class are pure PHP with no I/O —
  `tests/Unit/ValidatorTest.php` covers each constraint type and the
  collect-all-errors behavior directly against DTO instances, no database
  needed. `JsonResponse`'s extended signature gets updated unit tests for
  the `code`/`fields` shape. `app/api/*.php` itself still has no PHPUnit
  coverage (established convention for thin route files) — the
  DTO-construction-from-request-body wiring in each endpoint is verified
  via manual `curl`, matching this project's existing pattern for that
  layer.
- **JS:** still no test runner (see Non-goals) — `i18n.js` and the updated
  `planning_repet.js` handler are verified via `npm run lint:js` plus
  manual/headless-browser checks (as used for the XSS fix and the
  double-submit guard earlier in this remediation effort).

## Documentation updates

`CLAUDE.md`'s Language section is rewritten to state: API JSON response
bodies (`error`, `code`, `fields`, `reason`, field names) are English;
translation to French happens exclusively at the JS display layer via
`i18next`/`translateApiError`; page-level HTML/UI text (labels, buttons,
copy) remains French and is unaffected by this rule. The existing
`contact_messages` DB-column example stays as-is (unrelated — that's about
DB schema naming, not API response bodies).

## Rollout notes

This changes the JSON *shape* of error responses across most
`app/api/*.php` endpoints (adds `code`, and for validation failures,
`fields`). There are no known external consumers of this API besides this
site's own frontend, so no versioning or backward-compatibility scheme is
needed — every consumer is updated in the same change. This work touches
files already modified by the prior 5-PR remediation effort
(`JsonResponse`, `events.php`, `contact.php`, `responses.php`, `login.php`,
`planning_repet.js`) — all of that is merged to `main` already, so this is
a normal incremental change on top of current `main`, not a rebase concern.
