# 0011. Generate the API description from the code, and the client from the description

Status: Accepted, 2026-09-11

## Context

An OpenAPI document written by hand drifts from the controllers it describes. A review
on 2026-09-10 found this one accurate in its prose and wrong in its machine-readable
half: `403` appeared on none of the 16 permission-gated routes, a `201` was documented
as a `200` with an empty body, and two public forms could not be called from a
generated client at all.

## Decision

The code is the source of truth.

- Scramble derives `api/openapi.json` from the Laravel routes, form requests and
  resources. The file is committed and never edited by hand. CI's `openapi-drift` job
  regenerates it and fails on any difference, and Redocly lints it.
- Failure statuses come from each route's middleware (`DocumentsFailureModes`), and
  from `#[Emits]` for the error codes a controller raises itself. `DeclaredCodesTest`
  and `EmittedCodesTest` fail when one is missing.
- orval generates `web/src/api/generated/` from that file: the fetch client, TanStack
  Query hooks and MSW handlers for the mocked backend. It is never edited by hand
  either.
- Everything the generated code cannot know lives in one mutator,
  `web/src/api/http.ts`: cookie credentials, CSRF priming, orval's response envelope
  and the typed `ApiError`.

Rejected: writing the document first and testing the code against it, which turns a
free guarantee into a test to maintain; a hand-maintained YAML file; overlays or hand
edits to the generated document; and a 403 annotation on each route, which is sixteen
chances to forget one.

## Consequences

A change to any response shape means `npm run openapi && npm run generate:api` in the
same commit.

Where Scramble's inference falls short, the fix is an attribute or a Scramble
extension in `api/app/Support/Scramble/`, never an edit to the output.

The API reference at `/api/docs` renders the committed document, so it cannot describe
an API the client does not speak. Scramble is a development dependency and is not
installed on any server.
