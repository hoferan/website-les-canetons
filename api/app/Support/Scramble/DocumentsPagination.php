<?php

namespace App\Support\Scramble;

use App\Support\Page;
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
 * Describes the collection envelope App\Http\Middleware\PaginatesCollections
 * applies: `{data, meta}`, the `limit` and `offset` parameters, and the
 * RFC 8288 `Link` header.
 *
 * DERIVED FROM THE SAME FACT THE MIDDLEWARE USES, which is what keeps the two
 * from drifting. The middleware envelopes a response whose body is a JSON list;
 * this envelopes an operation whose success schema is an array. Those are the
 * static and runtime readings of one property — "this endpoint answers with a
 * collection" — so a new collection gains the envelope and its documentation in
 * the same commit, with nothing annotated anywhere.
 *
 * The agreement is asserted rather than assumed: Tests\Feature\PaginationTest
 * walks the exported document and the live routes and fails if an operation is
 * enveloped in one and not the other.
 *
 * A `$ref` IS LEFT ALONE, deliberately. The array schemas here are inline
 * (`{type: array, items: {$ref: MemberResource}}`), so there is nothing to
 * resolve — but if Scramble ever hoists one into a shared component, wrapping
 * the reference in place would redefine that component for every operation
 * pointing at it. Skipping is the safe direction, and the test above is what
 * turns the skip into a failure rather than a silent bare array.
 */
class DocumentsPagination extends OperationExtension
{
    public function handle(Operation $operation, RouteInfo $routeInfo): void
    {
        $wrapped = false;

        foreach ($operation->responses ?? [] as $response) {
            // A Reference is one of the shared Problem components. A failure
            // carries no collection.
            if (! $response instanceof Response) {
                continue;
            }

            $code = (int) ($response->code ?? 0);

            if ($code < 200 || $code > 299) {
                continue;
            }

            $schema = $response->content['application/json'] ?? null;

            if (! $schema instanceof Schema || ! $schema->type instanceof OpenApiTypes\ArrayType) {
                continue;
            }

            $schema->type = $this->envelope($schema->type);
            $wrapped = true;

            // `Link` describes how to walk a collection, so it belongs on the
            // reads. The one write that answers with a collection —
            // PUT .../registration-options — gets the envelope without it;
            // see the middleware for why.
            if (strtoupper($operation->method ?: $routeInfo->method) === 'GET') {
                $this->declareLinkHeader($response);
            }
        }

        if ($wrapped && strtoupper($operation->method ?: $routeInfo->method) === 'GET') {
            $this->declareParameters($operation);
        }
    }

    /** `{data: <the array that was there>, meta: {total, limit, offset}}`. */
    private function envelope(OpenApiTypes\ArrayType $rows): OpenApiTypes\ObjectType
    {
        return (new OpenApiTypes\ObjectType)
            ->addProperty('data', $rows->setDescription('This page of the collection, in the collection\'s own order.'))
            ->addProperty('meta', (new OpenApiTypes\ObjectType)
                ->addProperty('total', (new OpenApiTypes\IntegerType)
                    ->setDescription('How many rows the whole collection holds, not this page. Count a screen can display without first reading every row.'))
                ->addProperty('limit', (new OpenApiTypes\IntegerType)
                    ->setDescription('The page size that was APPLIED, which is the default when you asked for none and the cap when you asked for more.'))
                ->addProperty('offset', (new OpenApiTypes\IntegerType)
                    ->setDescription('Where this page starts in the collection.'))
                ->setRequired(['total', 'limit', 'offset'])
                ->setDescription('What you actually got.'))
            ->setRequired(['data', 'meta']);
    }

    /**
     * The two query parameters, with the real numbers in them.
     *
     * The default and the cap come from App\Support\Page rather than being
     * retyped, so changing the policy changes the document.
     */
    private function declareParameters(Operation $operation): void
    {
        $operation->addParameters([
            (new Parameter('limit', 'query'))
                ->setSchema(Schema::fromType(
                    (new OpenApiTypes\IntegerType)
                        ->setMin(1)
                        ->setMax(Page::MAX_LIMIT)
                        ->default(Page::DEFAULT_LIMIT)
                ))
                ->required(false)
                ->description(
                    'How many rows to return, at most '.Page::MAX_LIMIT.'. Defaults to '
                    .Page::DEFAULT_LIMIT.', which is above every collection this API holds, so '
                    .'omitting it returns the whole thing. A larger number is clamped and a '
                    .'value that is not a whole number is ignored; neither is an error, and '
                    .'`meta.limit` says what was applied.'
                ),
            (new Parameter('offset', 'query'))
                ->setSchema(Schema::fromType(
                    (new OpenApiTypes\IntegerType)->setMin(0)->default(0)
                ))
                ->required(false)
                ->description(
                    'How many rows to skip. Defaults to 0. Prefer following the `Link` header\'s '
                    .'`next` over computing this yourself.'
                ),
        ]);
    }

    private function declareLinkHeader(Response $response): void
    {
        $response->addHeader('Link', (new Header)
            ->setRequired(true)
            ->setSchema(Schema::fromType(new OpenApiTypes\StringType))
            ->setDescription(
                'RFC 8288 links to the rest of the collection: `first`, `last`, and `prev` and '
                .'`next` where they exist. Follow `next` until there is none rather than doing '
                .'arithmetic on `meta`. Your own query parameters are carried along, so paging '
                .'`/events?past=1` stays in the past. The URIs are relative — resolve them '
                .'against the URL you requested.'
            ));
    }
}
