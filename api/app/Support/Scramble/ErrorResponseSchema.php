<?php

namespace App\Support\Scramble;

use Dedoc\Scramble\Support\Generator\Types as OpenApiTypes;

/**
 * Builds the OpenAPI schema for App\Exceptions\ApiError's response body — an
 * RFC 9457 problem document:
 *
 *     {"type", "title", "status", "instance", "code", "errors":[…], "requestId",
 *      "documentation"}
 *
 * One builder, every extension, so the documented contract cannot differ between
 * statuses. ApiError is the authority on the shape; this only describes it, and
 * Tests\Feature\OpenApiDocumentTest pins the two together.
 *
 * EVERY MEMBER IS REQUIRED, `errors` included. That is a change from the
 * previous contract, where `fields` appeared only on a 400 and was absent
 * elsewhere — which made it optional in the document and cost every consumer a
 * null check for a case that carries no information. It is now always present
 * and empty when there is nothing field-level to say, so `$withErrors` below
 * governs only whether the entry SHAPE is worth documenting, never whether the
 * key exists.
 */
final class ErrorResponseSchema
{
    /**
     * @param  string[]  $codes  the `code` values this status can carry
     * @param  bool  $withErrors  whether this status ever populates `errors` — only
     *                            validation does, so only it documents the entry
     *                            shape; everywhere else the array is always empty
     *                            and an item schema would describe a case that
     *                            cannot occur.
     */
    public static function schema(array $codes, bool $withErrors = false): OpenApiTypes\ObjectType
    {
        $errorEntry = $withErrors ? self::entry() : new OpenApiTypes\ObjectType;

        return (new OpenApiTypes\ObjectType)
            ->addProperty('type', (new OpenApiTypes\StringType)
                ->setDescription(
                    'RFC 9457 problem type URI. Identifies the problem; it is not '
                    .'required to resolve. The same token as `code`, hyphenated.'
                ))
            ->addProperty('title', (new OpenApiTypes\StringType)
                ->setDescription('English message. Never displayed: the front end renders `code`.'))
            ->addProperty('status', (new OpenApiTypes\IntegerType)
                ->setDescription('The HTTP status code, repeated in the body as RFC 9457 intends.'))
            ->addProperty('instance', (new OpenApiTypes\StringType)
                ->setDescription('The path that was requested. Never the query string.'))
            ->addProperty('code', (new OpenApiTypes\StringType)
                ->enum($codes)
                ->setDescription('Stable machine token the front end maps to French.'))
            ->addProperty('errors', (new OpenApiTypes\ArrayType)
                ->setItems($errorEntry)
                ->setDescription(
                    $withErrors
                        ? 'One entry per rejected field, first failure only.'
                        : 'Always empty for this status; present so every problem has the same shape.'
                ))
            ->addProperty('requestId', (new OpenApiTypes\StringType)
                ->setDescription('ULID identifying this request. Echoed as the X-Request-Id header, and in the logs.'))
            ->addProperty('documentation', (new OpenApiTypes\StringType)
                ->setDescription(
                    'Where a human reads what this means. `type` is a URN and resolves to '
                    .'nothing by design; this is the member to follow.'
                ))
            ->setRequired(['type', 'title', 'status', 'instance', 'code', 'errors', 'requestId', 'documentation']);
    }

    /**
     * One `errors` entry.
     *
     * `params` is absent unless the reason interpolates (today: too_long,
     * invalid_value), so it is deliberately NOT required.
     */
    private static function entry(): OpenApiTypes\ObjectType
    {
        return (new OpenApiTypes\ObjectType)
            ->addProperty('field', new OpenApiTypes\StringType)
            ->addProperty('reason', new OpenApiTypes\StringType)
            ->addProperty('params', (new OpenApiTypes\ObjectType)
                ->additionalProperties(new OpenApiTypes\MixedType))
            ->setRequired(['field', 'reason']);
    }
}
