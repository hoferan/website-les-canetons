<?php

namespace App\Support\Scramble;

use App\Exceptions\ApiError;
use App\Http\Middleware\ConditionalWrite;
use App\Http\Middleware\IdempotentWrite;
use App\Http\Middleware\RunPendingMigrations;
use App\Support\Emits;
use App\Support\ErrorVocabulary;
use Dedoc\Scramble\Extensions\OperationExtension;
use Dedoc\Scramble\Support\Generator\Header;
use Dedoc\Scramble\Support\Generator\Operation;
use Dedoc\Scramble\Support\Generator\Parameter;
use Dedoc\Scramble\Support\Generator\Reference;
use Dedoc\Scramble\Support\Generator\Response;
use Dedoc\Scramble\Support\Generator\Schema;
use Dedoc\Scramble\Support\Generator\Types as OpenApiTypes;
use Dedoc\Scramble\Support\RouteInfo;
use Illuminate\Support\Facades\Route;

/**
 * Declares the failures a route can answer with, read off the route's own
 * middleware.
 *
 * The schema is what gets compiled into a client: a status missing here is
 * missing from a generated client's type union, whatever the operation's prose
 * says. The statuses are derived from the middleware instead of annotated per
 * route, because the middleware is what refuses (`permission:events.manage` is
 * the reason a 403 exists). Adding or removing it adds or removes the status,
 * so the document cannot drift from the routes.
 *
 * The route table cannot imply the 409s, or the 403s that are not about a
 * missing permission (`not_answerable`, `reauth_failed`). Controllers and
 * domain services raise those, so the action declares them with
 * `#[Emits(...)]`. See App\Support\Emits.
 *
 * handle() collects a status => codes map before declaring anything, so each
 * status gets one response naming every code it can carry on that route. The
 * public forms answer 400 both for a rejected field and for a missing
 * Idempotency-Key, and a response naming only one of them misleads a client
 * about the other.
 */
class DocumentsFailureModes extends OperationExtension
{
    /**
     * status => the code the shared `Problem<status>` component carries.
     *
     * The baseline is what a route answers with that status from the ordinary
     * machinery alone. An operation whose set for a status is exactly this
     * references the shared component; one that can also answer with something
     * else gets an inline response naming all of them. See declare().
     *
     * ValidationExceptionResponse registers the 400 baseline, and their own
     * extensions register 401 and 404. They are listed so this class knows
     * what an already-declared response contains when it widens one.
     *
     * There is no 409. Every 409 in this API names a specific conflict (a
     * booking outside its window, an option somebody has taken, a key already
     * used), so each operation declares its own. A shared `Problem409` would
     * carry whichever conflict happened to register it first.
     */
    private const BASELINE = [
        400 => 'validation_failed',
        401 => 'not_authenticated',
        403 => 'access_denied',
        404 => 'not_found',
        412 => 'if_match_failed',
        419 => 'invalid_session',
        422 => 'spam_suspected',
        428 => 'if_match_required',
        429 => 'rate_limited',
        503 => 'service_unavailable',
    ];

    /** status => what the response says it is, for a reader. */
    private const DESCRIPTIONS = [
        400 => 'The submitted fields were rejected, or a required header was missing or malformed.',
        401 => 'No session, or it has expired. Log in and retry.',
        403 => 'Authenticated, but not permitted to do this.',
        404 => 'No such record.',
        409 => 'Allowed, but it conflicts with the current state of things.',
        412 => 'The If-Match header names a state this thing is no longer in. Re-read it and decide again.',
        419 => 'The CSRF token was missing or stale. Re-prime it and retry; you are still logged in.',
        422 => 'The submission looks automated. See Public forms.',
        428 => 'This write must carry an If-Match header. See Conditional writes.',
        429 => 'Too many requests. Retry-After says how long to wait.',
        503 => 'The service is temporarily refusing to serve. Retry shortly.',
    ];

    /**
     * The methods ConditionalWrite makes conditional, read from it, so a
     * conditioned POST (publishing an event, replacing a photo) is documented
     * as needing `If-Match` like any PATCH.
     */
    private const CONDITIONED = ConditionalWrite::CONDITIONED;

    public function handle(Operation $operation, RouteInfo $routeInfo): void
    {
        $middleware = $this->middlewareOf($routeInfo);
        $method = strtoupper($operation->method ?: $routeInfo->method);

        // status => the codes this operation can answer with. Declared at the
        // end, because a status can gain codes from more than one source and
        // its response has to name all of them.
        $failures = [];

        $can = function (int $status, string ...$codes) use (&$failures): void {
            foreach ($codes as $code) {
                $failures[$status][] = $code;
            }
        };

        if (in_array('auth:sanctum', $middleware, true)) {
            $can(401, 'not_authenticated');
        }

        foreach ($middleware as $entry) {
            if (is_string($entry) && str_starts_with($entry, 'permission:')) {
                $can(403, 'access_denied');
                break;
            }
        }

        // A bound route parameter is the only way a 404 can arise from the
        // route table: route-model binding refuses an id nothing matches. A
        // route with no parameters cannot 404 except by not existing.
        if ($routeInfo->route->parameterNames() !== []) {
            $can(404, 'not_found');
        }

        // Sanctum's stateful mode puts /api/v1/* behind the `web` middleware
        // group, so every mutating request needs the replayed X-XSRF-TOKEN and
        // can answer 419. Derived from the method because the CSRF check lives
        // inside the group Sanctum nests, not as a listed entry.
        if (in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'], true)) {
            $can(419, 'invalid_session');
        }

        if (in_array('public-write', $middleware, true)) {
            $can(422, 'spam_suspected');
            $this->declarePublicWriteGuard($operation);
        }

        foreach ($middleware as $entry) {
            if (is_string($entry) && str_starts_with($entry, 'throttle:')) {
                $can(429, 'rate_limited');
                break;
            }
        }

        foreach ($middleware as $entry) {
            if (is_string($entry) && str_starts_with($entry, 'etag:')) {
                if (in_array($method, self::CONDITIONED, true)) {
                    $can(412, 'if_match_failed');
                    $can(428, 'if_match_required');
                }
                $this->declareConditionalWrite($operation, $method);
                break;
            }
        }

        if (in_array('idempotent', $middleware, true)) {
            // The 400 joins the codes validation already declared for it.
            $can(400, 'idempotency_key_required', 'idempotency_key_invalid');
            $can(409, 'idempotency_key_reuse');
            $this->declareIdempotencyKey($operation);
        }

        // Every route behind RunPendingMigrations can answer 503: it refuses to
        // serve against a schema it cannot vouch for. A client needs to know
        // that answer is possible and retryable.
        if (in_array(RunPendingMigrations::class, $middleware, true)) {
            $can(503, 'service_unavailable');
        }

        // What the route table cannot imply: a booking outside its window, a
        // register somebody is not in, the last administrator. See
        // App\Support\Emits.
        foreach ($this->emitted($routeInfo) as $code) {
            $status = ErrorVocabulary::statusFor($code);

            if ($status !== null) {
                $can($status, $code);
            }
        }

        foreach ($failures as $status => $codes) {
            $this->declare($operation, $status, $codes);
        }
    }

    /**
     * The route's middleware, with group names expanded to what they contain.
     *
     * `gatherMiddleware()` returns the group name (a route in routes/api.php
     * reports `['api']` and nothing else), so middleware registered on the
     * group, such as RunPendingMigrations, is invisible to a plain scan.
     *
     * One level deep, which is all the groups here are. A group holding
     * another group would need recursion.
     *
     * @return list<mixed>
     */
    private function middlewareOf(RouteInfo $routeInfo): array
    {
        $groups = Route::getMiddlewareGroups();
        $expanded = [];

        foreach ($routeInfo->route->gatherMiddleware() as $entry) {
            if (is_string($entry) && isset($groups[$entry])) {
                foreach ($groups[$entry] as $inner) {
                    $expanded[] = is_object($inner) ? $inner::class : $inner;
                }

                continue;
            }

            $expanded[] = $entry;
        }

        return $expanded;
    }

    /**
     * The codes the action itself declares, through #[Emits].
     *
     * An unknown code is dropped rather than published: a typo must not put a
     * token in the contract that no client will ever receive.
     * Tests\Feature\EmittedCodesTest is what turns it red.
     *
     * @return list<string>
     */
    private function emitted(RouteInfo $routeInfo): array
    {
        $action = $routeInfo->reflectionMethod();

        if ($action === null) {
            return [];
        }

        $codes = [];

        foreach ($action->getAttributes(Emits::class) as $attribute) {
            foreach ($attribute->newInstance()->codes as $code) {
                $codes[] = $code;
            }
        }

        return $codes;
    }

    /**
     * The header a public submission must carry.
     *
     * The statuses it can answer with (400 for a missing or malformed key, 409
     * for one already used) are collected in handle(), so they join the codes
     * those statuses already carry.
     */
    private function declareIdempotencyKey(Operation $operation): void
    {
        $operation->addParameters([
            (new Parameter(IdempotentWrite::HEADER, 'header'))
                ->setSchema(Schema::fromType(new OpenApiTypes\StringType))
                ->required(true)
                ->description(
                    'A key identifying this submission, 16 to 255 printable ASCII characters — a '
                    .'UUID is the expected shape. Generate it when the form is rendered and send '
                    .'the same one for every attempt: a retry then returns the first answer and '
                    .'books nothing twice. A fresh submission needs a fresh key.'
                ),
        ]);
    }

    /**
     * What `etag:<facet>` on a route means for its contract.
     *
     * Both halves: the header a write owes and the header a read hands out are
     * one mechanism. A client that knows about the 428 but not the `ETag`
     * would have to send something it has nowhere to get.
     *
     * Read off the middleware like everything else here, so a route gaining or
     * losing `etag:` moves the document with it.
     */
    private function declareConditionalWrite(Operation $operation, string $method): void
    {
        if (! in_array($method, self::CONDITIONED, true)) {
            // A read: it hands out the tag the writes need (see
            // App\Http\Middleware\ConditionalWrite) and refuses nothing.
            $this->declareEntityTagHeader($operation);

            return;
        }

        $operation->addParameters([
            (new Parameter('If-Match', 'header'))
                ->setSchema(Schema::fromType(new OpenApiTypes\StringType))
                ->required(true)
                ->description(
                    'The `ETag` of the thing as you last read it. Read it first and quote the '
                    .'header back verbatim, quotes included. Absent answers 428; naming a state '
                    .'this thing is no longer in answers 412.'
                ),
        ]);

        // A PUT or PATCH answers with the thing it just wrote, so it carries
        // the new tag and a second edit needs no read between them. A DELETE
        // does not: there is nothing left to tag.
        if ($method !== 'DELETE') {
            $this->declareEntityTagHeader($operation);
        }
    }

    /** The `ETag` on every successful response of a route that has one. */
    private function declareEntityTagHeader(Operation $operation): void
    {
        foreach ($operation->responses ?? [] as $response) {
            // A Reference here is one of the shared Problem components, which
            // every operation that fails that way points at, so it carries no
            // tag.
            if (! $response instanceof Response) {
                continue;
            }

            $code = (int) ($response->code ?? 0);

            if ($code < 200 || $code > 299) {
                continue;
            }

            $response->addHeader('ETag', (new Header)
                ->setRequired(true)
                ->setSchema(Schema::fromType(new OpenApiTypes\StringType))
                ->setDescription(
                    'A strong entity tag for this thing as it now stands. Send it back as '
                    .'`If-Match` when you write.'
                ));
        }
    }

    /**
     * Declares one status, naming every code this operation can answer it with.
     *
     * A set that is exactly the baseline for that status references the shared
     * `Problem<status>` component, so the document carries that shape once. A
     * set with anything extra gets its own inline response naming all of them,
     * because a shared component cannot be right for two different sets.
     *
     * An existing response is widened. Scramble infers the 400 from the
     * FormRequest before this extension runs, so an operation that can also
     * answer 400 for a missing Idempotency-Key has to replace that reference.
     * The baseline says what the existing response carries, so the replacement
     * is a union.
     *
     * @param  list<string>  $codes
     */
    private function declare(Operation $operation, int $status, array $codes): void
    {
        $existing = $this->responseFor($operation, $status);

        if ($existing !== null && isset(self::BASELINE[$status])) {
            // Whatever declared it first declared the baseline; keep it.
            $codes[] = self::BASELINE[$status];
        }

        // Sorted and deduplicated so the exported document is byte-identical
        // between runs, which CI's openapi-drift job diffs.
        $codes = array_values(array_unique($codes));
        sort($codes);

        $isBaseline = isset(self::BASELINE[$status]) && $codes === [self::BASELINE[$status]];

        if ($isBaseline) {
            if ($existing instanceof Reference) {
                return;
            }

            // An inline response here is Scramble reading an ApiError::json()
            // the action returns itself, such as ImageController::store()'s
            // 503: the status is right, but it is published as
            // application/json with no description. The shared component
            // describes the same refusal correctly.
            if ($existing !== null) {
                $this->drop($operation, $status);
            }

            $this->reference($operation, $status);

            return;
        }

        $this->inline($operation, $status, $codes);
    }

    /** Removes this operation's response for a status, if it has one. */
    private function drop(Operation $operation, int $status): void
    {
        $kept = [];

        foreach ($operation->responses ?? [] as $response) {
            if ($this->statusOf($response) !== $status) {
                $kept[] = $response;
            }
        }

        $operation->responses = $kept;
    }

    /** Points the operation at the shared component, registering it if new. */
    private function reference(Operation $operation, int $status): void
    {
        $components = $this->openApiTransformer->getComponents();
        $reference = new Reference('responses', 'Problem'.$status, $components);

        if (! $components->has($reference)) {
            $components->add($reference, $this->response($status, [self::BASELINE[$status]]));
        }

        $operation->addResponse($reference);
    }

    /**
     * Replaces this operation's response for a status with one naming exactly
     * the codes it can answer with.
     *
     * The responses array is rebuilt instead of the existing object being
     * edited, because that object is usually a Reference into the shared
     * components, and editing it would change every operation pointing at it.
     */
    private function inline(Operation $operation, int $status, array $codes): void
    {
        $this->drop($operation, $status);
        $operation->addResponse($this->response($status, $codes));
    }

    /**
     * One problem response. Every status goes through this builder so the
     * shape cannot differ between them.
     *
     * `withErrors` only for a status that really populates `errors`, which is
     * validation alone: everywhere else the array is always empty and an item
     * schema would describe a case that cannot occur.
     *
     * @param  list<string>  $codes
     */
    private function response(int $status, array $codes): Response
    {
        return Response::make($status)
            ->setDescription(self::DESCRIPTIONS[$status] ?? 'The request was refused.')
            ->setContent(ApiError::MEDIA_TYPE, Schema::fromType(ErrorResponseSchema::schema(
                $codes,
                withErrors: in_array('validation_failed', $codes, true),
            )));
    }

    /** This operation's response for a status, resolved through a $ref if need be. */
    private function responseFor(Operation $operation, int $status): Response|Reference|null
    {
        foreach ($operation->responses ?? [] as $response) {
            if ($this->statusOf($response) === $status) {
                return $response;
            }
        }

        return null;
    }

    private function statusOf(Response|Reference $response): ?int
    {
        $code = $response instanceof Reference
            ? ($this->openApiTransformer->getComponents()->get($response)->code ?? null)
            : ($response->code ?? null);

        return $code === null ? null : (int) $code;
    }

    /**
     * The two things a public form must send: the X-Form-Token header and the
     * `website` honeypot field. Omitting either answers 422, so a client
     * generated without them could never submit a public form.
     *
     * Derived from the `public-write` middleware, which is the guard itself, so
     * a route gaining it gains the documentation.
     */
    private function declarePublicWriteGuard(Operation $operation): void
    {
        $operation->addParameters([
            (new Parameter('X-Form-Token', 'header'))
                ->setSchema(Schema::fromType(new OpenApiTypes\StringType))
                ->required(true)
                ->description(
                    'A token from GET /api/v1/form-token, at least two seconds and at most two '
                    .'hours old. Fetch it when the form is rendered, not when it is submitted.'
                ),
        ]);

        $body = $operation->requestBodyObject?->content['application/json'] ?? null;

        // The content entry itself is a $ref to a shared request schema, not a
        // schema carrying a $ref, so the object to extend is the component the
        // reference names. Reading `$body->type` directly silently drops the
        // field.
        //
        // Larastan calls this branch impossible because Scramble's docblock
        // types `content` as Schema|null. At runtime it is a Reference for both
        // public forms; trust that over the annotation.
        /** @phpstan-ignore instanceof.alwaysFalse */
        if ($body instanceof Reference) {
            $body = $this->openApiTransformer->getComponents()->get($body);
        }

        // Explicit rather than `$body?->type ?? null`: after the branch above
        // the analyser knows $body is non-null, and a nullsafe there reads as
        // doubt the types do not support.
        $type = $body instanceof Schema ? $body->type : null;

        if (! $type instanceof OpenApiTypes\ObjectType) {
            return;
        }

        // Not in the FormRequest's rules(), where it would document itself: a
        // rule would answer 400 validation_failed naming `website`, telling a
        // script which check it failed. App\Http\Middleware\PublicWriteGuard's
        // vague 422 exists to avoid that, so the guard stays silent and the
        // document explains.
        $type
            ->addProperty('website', (new OpenApiTypes\StringType)
                ->setDescription(
                    'A honeypot. Send it PRESENT AND EMPTY. Anything else answers 422 — it is a '
                    .'field a person never sees and only a script fills in.'
                ))
            ->addRequired(['website']);
    }
}
