# Add or change an endpoint

This walks one change from the database to a page. The example throughout is
the event tags: the smallest resource with the full set of reads and writes.
Open its files beside this page:

| Layer | File |
| --- | --- |
| Migration | `api/database/migrations/2026_10_06_000001_create_event_tags_tables.php` |
| Model | `api/app/Models/EventTag.php` |
| Validation | `api/app/Http/Requests/StoreEventTagRequest.php` |
| Controller | `api/app/Http/Controllers/Api/EventTagController.php` |
| Response shape | `api/app/Http/Resources/EventTagResource.php` |
| Routes | `api/routes/api.php`, under "The event tags" |
| Page | `web/src/pages/EventTags.tsx` |
| Mock | `web/src/mocks/handlers.ts`, the event tag handlers |

Most steps have a test that fails when you skip them. They are named at each
step, and listed together at the end.

## 1. The schema

Add a migration. It has to be safe to run twice and must not break the code
already deployed. [Write a migration](migrations.md) explains why and how.

Give the model a `@property` docblock for every column. Scramble reads it to
type the JSON it publishes; without it Scramble guesses from a throwaway SQLite
copy of the schema.

## 2. Validation

One form request per write, in `app/Http/Requests/`.

- Field names are **camelCase** on the wire (`labelFr`, not `label_fr`).
- A `/** */` comment above a rule becomes that field's description in the API
  reference.
- `rules()` must work with no route bound, because `ApiErrorVocabularyTest`
  calls it on every form request to collect field names.
- **Every field needs a label in `fields:` in both `web/src/i18n/fr.ts` and
  `de.ts`.** A validation error reaches the screen as that label followed by the
  reason, for example "Nom en français est obligatoire".
  `ApiErrorVocabularyTest` fails on a field without one.

## 3. The response

A resource class in `app/Http/Resources/` decides the JSON:

- keys in camelCase;
- a `/** */` comment on each key, which becomes its description;
- timestamps through `Iso8601::utc($date)`, never `->toIso8601String()`. The
  wrapper is what publishes the field as `date-time`, and
  `PublishedConstraintsTest` fails on a bare string. For a nullable date, write
  `$date === null ? null : Iso8601::utc($date)` inline.

A list endpoint returns `XResource::collection(...)` and nothing more.
`PaginatesCollections` wraps every list in `{data, meta}` and adds the paging
`Link` header. Do not build the envelope yourself.

## 4. The controller

```php
#[Group('Event tags', 'The labels events carry ...', weight: 41)]
class EventTagController extends Controller
{
    #[Endpoint(operationId: 'eventTag.update')]
    #[Response(200, 'The tag as it now stands.')]
    public function update(StoreEventTagRequest $request, EventTag $eventTag): JsonResponse
```

- **`operationId`** is `resource.action` in camelCase. It becomes the name of
  the generated hook (`eventTag.index` turns into `useEventTagIndex`), so
  choose it with care. `OperationIdentityTest` checks the form and that each is
  unique.
- **`#[Group]`** needs a description. Same test.
- **`#[Response(200, '...')]`** wherever Scramble would leave a success
  undescribed. `ResponseHygieneTest` fails on a 2xx with no description.
  `api/app/Http/Controllers/Api/README.md` has the docblock conventions;
  notably, Scramble publishes the comment right above a `return` as the
  response description.

### Refusing with a new error code

Validation failures are handled for you. For any other refusal, return a
problem document with a code, and declare that the action can produce it.
`SectionController::destroy` is the example:

```php
#[Emits('register_in_use')]
public function destroy(Request $request, Section $section): JsonResponse
{
    // ...
    return ApiError::json(409, 'register_in_use', 'Somebody plays in ...');
}
```

Then:

1. Add the code to `PROBLEMS` in `app/Support/ErrorVocabulary.php`, with its
   status and an English description. The status there must match the call.
2. Add `errors.<code>` to **both** `fr.ts` and `de.ts`. That text is what the
   member reads; `translateApiError()` looks it up. A German entry that is
   missing falls back to French without any warning, so the test is your only
   check.

Do not put codes the middleware already implies (401, 403, 404, 412, 422, 428
and the like) in `#[Emits]`. They are added to the document from the route.

Error codes, reasons and every other wire value are English. French and German
exist only in `web/src/i18n/`.

## 5. The route

In `api/routes/api.php`:

```php
// The event tags (#107). Reading them takes `events.view`, since the
// planning's filter needs the list; changing them takes `events.manage`.
Route::get('/event-tags', [EventTagController::class, 'index'])
    ->middleware('permission:events.view');
Route::middleware('permission:events.manage')->group(function () {
    Route::get('/event-tags/{eventTag}', [EventTagController::class, 'show'])
        ->middleware('etag:event_tag');
    Route::post('/event-tags', [EventTagController::class, 'store']);
    Route::put('/event-tags/{eventTag}', [EventTagController::class, 'update'])
        ->middleware('etag:event_tag');
    // ...
});
```

- **A comment** on each route or group, saying why it is public or which
  permission gates it. No test checks this; reviewers do.
- **`permission:<name>`** on every route inside the `auth:sanctum` group.
  Access is decided by a permission, never by a role or a register
  (ADR 0014). `PermissionMiddlewareTest` fails on a signed-in route without
  one, and `AccessDecidedByPermissionTest` fails on code that checks a role or
  a register instead.
- **`etag:<facet>`** on a write that replaces or removes a thing, and on the
  single-thing read the edit screen starts from. The client sends back the
  `ETag` of that read in `If-Match`, so two people editing the same tag cannot
  silently overwrite each other. A new facet needs an entry in `FACETS` and an
  arm in `state()` in `app/Support/EntityTag.php`, and a fixture in
  `ConditionalWriteTest`.
- **A public POST** (one an anonymous visitor can make) also needs the
  `public-write` and `idempotent` middleware, like the contact form. ADR 0019.

### A new permission

Only add one once a route checks it. Then:

1. A case in `app/Support/Permission.php`, named `area.action`.
2. The value, in order, in `tests/Unit/PermissionTest.php`.
3. `permissions.<area_action>` with a `label` and a `hint` in `fr.ts` and
   `de.ts` (`PermissionCopyTest`).
4. A migration that grants it to the existing `direction` role. Copy
   `2026_10_12_000001_grant_roles_manage.php` and its test,
   `GrantRolesManageTest`. The seed migration grants every permission only on
   a fresh database, so existing servers need this step.
5. The permission in the mocked users' lists in `web/src/mocks/handlers.ts`,
   and in the exact list `handlers.test.ts` expects for `demo.direction`.
6. The permission list in the API reference's introduction,
   `api/config/scramble.php`. Nothing checks this one.

The role editor on `/roles` picks it up from the generated client by itself.

## 6. Regenerate the contract and the client

```bash
npm run openapi        # writes api/openapi.json
npm run generate:api   # writes web/src/api/generated/
```

Commit both with the code that changed them. Never edit either by hand. CI's
`openapi-drift` job regenerates them and fails on any difference.

Regenerate **before** running the Laravel suite. Most contract tests read the
committed `openapi.json`, so against a stale document they pass locally and
fail in CI.

If the document comes out wrong, read the Scramble entries in
[`docs/traps.md`](../traps.md) before debugging. Scramble fails quietly in
several ways, and each one there cost real debugging time.

## 7. The page

Use the generated hooks. Never call `fetch("/api/...")`: every request has to
go through the mutator in `web/src/api/http.ts`, which adds the cookies and the
CSRF token. A write without them answers `419`.

```tsx
const list = useEventTagIndex();
const tags = rowsOf<EventTagResource>(list.data);   // unwraps {data, meta}
```

After a write, invalidate the list with
`queryClient.invalidateQueries({ queryKey: getEventTagIndexQueryKey() })`.

A conditional write reads the thing first and sends its tag back:

```tsx
const read = await eventTagShow(tag.id);
const etag = read.status === 200 ? entityTagOf(read) : null;
if (read.status !== 200 || etag === null) {
  return;
}
await eventTagUpdate(tag.id, body, ifMatch(etag));
```

For errors, `useApiFormError()` turns an `ApiError` into translated text, with
a message per field. All user-facing text goes through `t()` and lives in both
catalogues; `de.ts` is typed `typeof fr`, so a key missing from either fails
`npm run typecheck`.

Hide a control the member cannot use with `can("<permission>")`. That is for
the interface only; the API's middleware is what enforces it.

A new page also needs its route in `web/src/routes.tsx`, behind
`<RequirePermission>` if it is not public, and an entry in
`web/screenshots/pages.json`. `screenshot-pages.test.mjs` fails without it.

## 8. The mock

After `generate:api`, the new endpoint already answers in `dev:mock` with
random data from the generated handlers. Write a handler of your own in
`web/src/mocks/handlers.ts` when the page needs believable or stateful data,
which is almost always. Put it in the overrides, ahead of the generated ones,
and reuse the helpers there:

- `collection(rows, request)` for a list, which builds `{data, meta}`;
- `refuseWithout("<permission>")` for the 401 or 403;
- `refuseWithoutIfMatch(request, tag)` and `mockEntityTag(thing)` for
  conditional writes;
- `problem(...)` for any refusal.

The mock has to refuse what the real API refuses. Otherwise a page works in
the Playwright specs and fails against the server.

## 9. Check it

```bash
npm run check      # types, lint, Vitest, node tests
npm run test:api   # the Laravel suite, contract tests included
npm run test:e2e   # if a page changed
```

Then sign in on :5173 with the account the change is for, and try it. A green
suite has passed over broken pages in this project before. A pull request
carries a screenshot or a measured result as evidence.

## Which test fails when you skip a step

| You skipped | What fails |
| --- | --- |
| A French or German label for a new field | `ApiErrorVocabularyTest` |
| Copy for a new error code, or its `ErrorVocabulary` entry | `ApiErrorVocabularyTest` |
| `#[Emits]` on a new refusal | `DeclaredCodesTest`, `EmittedCodesTest` |
| `permission:` on a signed-in route | `PermissionMiddlewareTest` |
| `operationId` or a group description | `OperationIdentityTest` |
| A description on a success response | `ResponseHygieneTest` |
| `Iso8601::utc()` on a timestamp | `PublishedConstraintsTest` |
| The `EntityTag` arm or test fixture for a new facet | `ConditionalWriteTest` |
| A new permission's copy, or its place in the list | `PermissionCopyTest`, `PermissionTest` |
| Regenerating the contract or the client | CI's `openapi-drift` |
| A new catalogue key in one language only | `npm run typecheck` |
| A new page missing from `pages.json` | `screenshot-pages.test.mjs` |

Nothing fails when you skip:

- the comment on a route;
- the permission list in `scramble.php`;
- adding a new list to the hand-kept URLs in `PaginationTest`'s runtime check
  (the document side is checked automatically);
- a hand-written mock that matches the API's refusals.

[Where things live](map.md) lists every guard with what it protects.
