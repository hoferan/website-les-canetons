# 0012. Report errors as problem documents that carry no language

Status: Accepted, 2026-09-11

## Context

API errors were once French sentences, and only the first invalid field was reported.
Laravel's native error shape, `{message, errors: {}}`, carries English sentences
instead. Neither can be translated by a client: there is nothing stable to look up.

The UI speaks French and German (ADR 0023), and the API is meant to be usable by
someone other than this SPA (ADR 0013).

## Decision

Every failure is an RFC 9457 problem document, `application/problem+json`, with the
same seven keys: `title`, `status`, `code`, `instance`, `errors`, `requestId` and
`detail`. `App\Exceptions\ApiError` renders it, and `ApiErrorContractTest` pins the
set.

- `code` and each `errors[].reason` are machine tokens from closed vocabularies in
  `App\Support\ErrorVocabulary`, and each code has exactly one status.
- `detail` is one English sentence telling a developer what to do. `title` is English
  too. Nothing in the body is meant for an end user.
- `requestId` is a ULID, echoed in a header and written to the log.
- There is no `type` member. Three forms were tried and each was a constant prefix
  plus `code`, carrying nothing new.
- Authentication failures never carry field detail, so a response cannot reveal
  whether the username or the password was wrong.

In the SPA, `translateApiError()` in `web/src/i18n/` is the only place user-facing
language is computed. It maps `code` and `reason` onto whichever catalogue is loaded.

## Consequences

Every new token needs copy in both `web/src/i18n/fr.ts` and `de.ts`.
`ApiErrorVocabularyTest` reads both files and fails otherwise. Without it, a token
missing from `de.ts` would silently fall back to French.

The renderer has ordering traps: Laravel's `prepareException()` rewrites authorization
failures and the 419, and throttling and 404s both escaped the contract once.

The client renames the wire's `errors` to `fields`, deliberately; see
`web/src/api/http.ts`.
