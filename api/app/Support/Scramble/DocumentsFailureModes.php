<?php

namespace App\Support\Scramble;

use App\Exceptions\ApiError;
use Dedoc\Scramble\Extensions\OperationExtension;
use Dedoc\Scramble\Support\Generator\Header;
use Dedoc\Scramble\Support\Generator\Operation;
use Dedoc\Scramble\Support\Generator\Parameter;
use Dedoc\Scramble\Support\Generator\Reference;
use Dedoc\Scramble\Support\Generator\Response;
use Dedoc\Scramble\Support\Generator\Schema;
use Dedoc\Scramble\Support\Generator\Types as OpenApiTypes;
use Dedoc\Scramble\Support\RouteInfo;

/**
 * Declares the failures a route can answer with, read off the route's own
 * middleware.
 *
 * WHY THIS EXISTS. A documentation review on 2026-09-11 counted the statuses
 * the document declared against the ones the API emits:
 *
 *     declared:  200×30  201×3  400×14  401×28  404×19  409×1  429×1  503×1
 *     reality:   403 on sixteen permission-gated routes, 419 on every write,
 *                422 on both public forms, 409 on seven endpoints
 *
 * `403` appeared **zero** times, while a dozen operation descriptions said
 * "Requires `events.manage`". The prose was accurate and the schema was not —
 * and the schema is the half that gets compiled into a client. Every one of
 * those is a status a generated client's type union does not contain.
 *
 * WHY IT IS DERIVED RATHER THAN ANNOTATED. Sixteen routes needing a `403`
 * annotation is sixteen chances to forget one, and the seventeenth route added
 * next year has nobody to remind it. The middleware is already the authority on
 * what a route refuses — `permission:events.manage` IS the reason a 403 exists —
 * so reading it means the document cannot drift from the routes. Add the
 * middleware and the status appears; remove it and the status goes.
 *
 * WHAT IT CANNOT SEE, deliberately: the 409s, and the 403s that are not about a
 * missing permission (`not_answerable`, `reauth_failed`). Those are raised by
 * controllers and domain services, not by middleware, so nothing in the route
 * table implies them. They need `#[Response]` on the action — annotation is
 * right there, because the fact really is per-action.
 */
class DocumentsFailureModes extends OperationExtension
{
    /**
     * status => [code, description]
     *
     * One code each, and that is not a simplification: a middleware-derived
     * failure has exactly one cause. A 403 from `permission:` is always
     * access_denied; the other 403s come from somewhere this extension cannot
     * see.
     */
    private const FAILURES = [
        401 => ['not_authenticated', 'No session, or it has expired. Log in and retry.'],
        403 => ['access_denied', 'Authenticated, but not permitted to do this.'],
        404 => ['not_found', 'No such record.'],
        412 => ['if_match_failed', 'The If-Match header names a state this thing is no longer in. Re-read it and decide again.'],
        419 => ['invalid_session', 'The CSRF token was missing or stale. Re-prime it and retry; you are still logged in.'],
        422 => ['spam_suspected', 'The submission looks automated. See Public forms.'],
        428 => ['if_match_required', 'This write must carry an If-Match header. See Conditional writes.'],
        429 => ['rate_limited', 'Too many requests. Retry-After says how long to wait.'],
    ];

    /** The methods App\Http\Middleware\ConditionalWrite makes conditional. */
    private const CONDITIONED = ['PUT', 'PATCH', 'DELETE'];

    public function handle(Operation $operation, RouteInfo $routeInfo): void
    {
        $middleware = $routeInfo->route->gatherMiddleware();
        $method = strtoupper($operation->method ?: $routeInfo->method);

        if (in_array('auth:sanctum', $middleware, true)) {
            $this->declare($operation, 401);
        }

        foreach ($middleware as $entry) {
            if (is_string($entry) && str_starts_with($entry, 'permission:')) {
                $this->declare($operation, 403);
                break;
            }
        }

        // A bound route parameter is the only way a 404 can arise from the
        // route table: route-model binding refuses an id nothing matches. A
        // route with no parameters cannot 404 except by not existing.
        if ($routeInfo->route->parameterNames() !== []) {
            $this->declare($operation, 404);
        }

        // Sanctum's stateful mode puts /api/v1/* behind the `web` middleware
        // group, so EVERY mutating request needs the replayed X-XSRF-TOKEN and
        // every one of them can answer 419. Derived from the method rather than
        // from a middleware name because the CSRF check lives inside the group
        // Sanctum nests, not as a listed entry.
        if (in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'], true)) {
            $this->declare($operation, 419);
        }

        if (in_array('public-write', $middleware, true)) {
            $this->declare($operation, 422);
            $this->declarePublicWriteGuard($operation);
        }

        foreach ($middleware as $entry) {
            if (is_string($entry) && str_starts_with($entry, 'throttle:')) {
                $this->declare($operation, 429);
                break;
            }
        }

        foreach ($middleware as $entry) {
            if (is_string($entry) && str_starts_with($entry, 'etag:')) {
                $this->declareConditionalWrite($operation, $method);
                break;
            }
        }
    }

    /**
     * What `etag:<facet>` on a route means for its contract.
     *
     * Both halves, because the header a write owes and the header a read hands
     * out are one mechanism and a document carrying only one of them sends the
     * reader looking for the other. A client generated from a document that
     * declared the 428 but not the `ETag` would know it had to send something
     * and have nowhere to get it.
     *
     * Read off the middleware rather than annotated, for the reason everything
     * else here is: `etag:` IS the reason these statuses exist, so a route
     * gaining or losing it moves the document with no second edit to remember.
     */
    private function declareConditionalWrite(Operation $operation, string $method): void
    {
        if (! in_array($method, self::CONDITIONED, true)) {
            // A read. It hands out the tag the writes above need — see
            // App\Http\Middleware\ConditionalWrite — and refuses nothing.
            $this->declareEntityTagHeader($operation);

            return;
        }

        $this->declare($operation, 412);
        $this->declare($operation, 428);

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
        // the NEW tag and a second edit needs no read between them. A DELETE
        // does not: there is nothing left to tag.
        if ($method !== 'DELETE') {
            $this->declareEntityTagHeader($operation);
        }
    }

    /** The `ETag` on every successful response of a route that has one. */
    private function declareEntityTagHeader(Operation $operation): void
    {
        foreach ($operation->responses ?? [] as $response) {
            // A Reference here is one of the shared Problem components added
            // above, which must not claim to carry a tag — and could not, since
            // they are shared between every operation that fails that way.
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
     * Adds one failure, as a shared component so the document carries each shape
     * once rather than inline at every operation.
     *
     * Skipped when the operation already declares that status: Scramble infers
     * some of these from the controller, and a second 401 would overwrite the
     * inferred one with a less specific guess.
     */
    private function declare(Operation $operation, int $status): void
    {
        if ($this->alreadyDeclares($operation, $status)) {
            return;
        }

        [$code, $description] = self::FAILURES[$status];

        $components = $this->openApiTransformer->getComponents();
        $reference = new Reference('responses', 'Problem'.$status, $components);

        if (! $components->has($reference)) {
            $components->add($reference, Response::make($status)
                ->setDescription($description)
                ->setContent(ApiError::MEDIA_TYPE, Schema::fromType(ErrorResponseSchema::schema([$code]))));
        }

        $operation->addResponse($reference);
    }

    private function alreadyDeclares(Operation $operation, int $status): bool
    {
        foreach ($operation->responses ?? [] as $response) {
            $code = $response instanceof Reference
                ? ($this->openApiTransformer->getComponents()->get($response)->code ?? null)
                : ($response->code ?? null);

            if ((int) $code === $status) {
                return true;
            }
        }

        return false;
    }

    /**
     * The two things a public form must send, which existed only in prose.
     *
     * A client generated from the document could not submit either public form:
     * `StoreRegistrationRequest` listed seven fields and none of them was
     * `website`, and no operation in the document declared a single header
     * parameter. Both are MANDATORY — omitting either answers 422 — so a
     * codegen'd contact form failed 100% of the time.
     *
     * Derived from the `public-write` middleware for the same reason as
     * everything else here: that middleware IS the guard, so a route gaining it
     * gains the documentation automatically.
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

        // The content entry ITSELF is a $ref to a shared request schema, not a
        // schema carrying a $ref — which is why a first attempt that resolved
        // `$body->type` added the header and silently dropped the field. The
        // object to extend is the component the reference names.
        //
        // Larastan calls this branch impossible because Scramble types
        // `content` as Schema|null in a docblock. The docblock is narrower than
        // the runtime: a var_dump here prints Reference for both public forms,
        // which is how the dropped field was diagnosed. Trusting the annotation
        // over the observation would restore the bug.
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

        // NOT added to the FormRequest's rules(), which would document itself
        // for free. A rule would answer 400 validation_failed naming `website`,
        // telling a script precisely which check it failed and how to pass next
        // time — the exact thing App\Http\Middleware\PublicWriteGuard's vague
        // 422 exists to avoid. The guard stays silent; the DOCUMENT explains.
        $type
            ->addProperty('website', (new OpenApiTypes\StringType)
                ->setDescription(
                    'A honeypot. Send it PRESENT AND EMPTY. Anything else answers 422 — it is a '
                    .'field a person never sees and only a script fills in.'
                ))
            ->addRequired(['website']);
    }
}
