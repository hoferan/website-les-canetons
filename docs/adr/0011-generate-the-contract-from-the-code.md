---
status: accepted
date: 2026-09-11
decision-makers: André Hofer
---

# Generate the API description from the code, and the client from the description

## Context and Problem Statement

An OpenAPI document written by hand drifts from the controllers it describes. A review
on 2026-09-10 found this one accurate in its prose and wrong in its machine-readable
half: `403` appeared on none of the 16 permission-gated routes, a `201` was documented
as a `200` with an empty body, and two public forms could not be called from a
generated client at all.

What is the source of truth for the API description and the client that speaks it?

## Considered Options

- Generate the description from the code, and the client from the description
- Write the document first and test the code against it
- A hand-maintained YAML file
- Overlays or hand edits to the generated document
- A 403 annotation on each route

## Decision Outcome

Chosen option: "Generate the description from the code, and the client from the
description", because the code is the source of truth, and a description derived from
it cannot drift the way the hand-written one did.

- Scramble derives `api/openapi.json` from the Laravel routes, form requests and
  resources. The file is committed and never edited by hand.
- Failure statuses come from each route's middleware (`DocumentsFailureModes`), and
  from `#[Emits]` for the error codes a controller raises itself.
- orval generates `web/src/api/generated/` from that file: the fetch client, TanStack
  Query hooks and MSW handlers for the mocked backend. It is never edited by hand
  either.
- Everything the generated code cannot know lives in one mutator,
  `web/src/api/http.ts`: cookie credentials, CSRF priming, orval's response envelope
  and the typed `ApiError`.

### Consequences

- Good, because the API reference at `/api/docs` renders the committed document, so it
  cannot describe an API the client does not speak.
- Bad, because a change to any response shape means
  `npm run openapi && npm run generate:api` in the same commit.
- Bad, because where Scramble's inference falls short, the fix is an attribute or a
  Scramble extension in `api/app/Support/Scramble/`, never an edit to the output.

Scramble is a development dependency and is not installed on any server.

### Confirmation

CI's `openapi-drift` job regenerates `api/openapi.json` and fails on any difference,
and Redocly lints it. `DeclaredCodesTest` and `EmittedCodesTest` fail when a failure
status or an emitted code is missing.

## Pros and Cons of the Options

### Write the document first and test the code against it

- Bad, because it turns a free guarantee into a test to maintain.

### A hand-maintained YAML file

- Bad, because a document written by hand drifts from the controllers it describes.

### Overlays or hand edits to the generated document

- Bad, because the code stops being the source of truth.

### A 403 annotation on each route

- Bad, because it is sixteen chances to forget one.
