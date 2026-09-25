---
status: accepted
date: 2026-09-11
decision-makers: André Hofer
---

# Report errors as problem documents that carry no language

## Context and Problem Statement

API errors were once French sentences, and only the first invalid field was reported.
Laravel's native error shape, `{message, errors: {}}`, carries English sentences
instead. Neither can be translated by a client: there is nothing stable to look up.

The UI speaks French and German
([ADR-0023](0023-locale-in-the-path-text-in-typed-catalogues.md)), and the API is meant
to be usable by someone other than this SPA
([ADR-0013](0013-hold-the-api-to-public-standards.md)).

What shape does an API error take, so that any client can show it in its own language?

## Considered Options

- RFC 9457 problem documents that carry machine tokens and no user-facing language
- French sentences, reporting only the first invalid field
- Laravel's native error shape, `{message, errors: {}}`
- A problem document with a `type` member

## Decision Outcome

Chosen option: "RFC 9457 problem documents that carry machine tokens", because a
client can translate a stable token and cannot translate a sentence.

Every failure is an RFC 9457 problem document, `application/problem+json`, with the
same seven keys: `title`, `status`, `code`, `instance`, `errors`, `requestId` and
`detail`. `App\Exceptions\ApiError` renders it.

- `code` and each `errors[].reason` are machine tokens from closed vocabularies in
  `App\Support\ErrorVocabulary`, and each code has exactly one status.
- `detail` is one English sentence telling a developer what to do. `title` is English
  too. Nothing in the body is meant for an end user.
- `requestId` is a ULID, echoed in a header and written to the log.
- There is no `type` member.
- Authentication failures never carry field detail, so a response cannot reveal
  whether the username or the password was wrong.

In the SPA, `translateApiError()` in `web/src/i18n/` is the only place user-facing
language is computed. It maps `code` and `reason` onto whichever catalogue is loaded.

### Consequences

- Good, because user-facing language is computed in one place, `translateApiError()`.
- Bad, because every new token needs copy in both `web/src/i18n/fr.ts` and `de.ts`.
  Without `ApiErrorVocabularyTest`, a token missing from `de.ts` would silently fall
  back to French.
- Bad, because the renderer has ordering traps: Laravel's `prepareException()`
  rewrites authorization failures and the 419, and throttling and 404s both escaped
  the contract once.

The client renames the wire's `errors` to `fields`, deliberately; see
`web/src/api/http.ts`.

### Confirmation

`ApiErrorContractTest` pins the set of seven keys. `ApiErrorVocabularyTest` reads
`web/src/i18n/fr.ts` and `de.ts` and fails when a token has no copy in either.

## Pros and Cons of the Options

### French sentences, reporting only the first invalid field

- Bad, because a client cannot translate a sentence: there is nothing stable to look
  up.
- Bad, because only the first invalid field was reported.

### Laravel's native error shape

- Bad, because it carries English sentences, which a client cannot translate either.

### A problem document with a `type` member

- Bad, because three forms were tried and each was a constant prefix plus `code`,
  carrying nothing new.
