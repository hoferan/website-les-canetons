<?php

namespace App\Support\Scramble;

use App\Support\ErrorVocabulary;
use Dedoc\Scramble\Support\Generator\Types as OpenApiTypes;

/**
 * Builds the OpenAPI schema for App\Exceptions\ApiError's response body, an
 * RFC 9457 problem document:
 *
 *     {"title", "status", "code", "instance", "errors":[…], "requestId", "detail"}
 *
 * One builder, every extension, so the documented contract cannot differ between
 * statuses. ApiError is the authority on the shape; this only describes it, and
 * Tests\Feature\OpenApiDocumentTest pins the two together.
 *
 * Every member is required, `errors` included: it is always present, and empty
 * when there is nothing field-level to say, so a consumer needs no null check.
 * `$withErrors` below governs only whether the entry shape is documented,
 * never whether the key exists.
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
            ->addProperty('detail', (new OpenApiTypes\StringType)
                ->setDescription(
                    'RFC 9457 §3.1.1: what happened and what to do about it, in English, for a '
                    .'developer reading the response. Never rendered to an end user.'
                ))
            ->setRequired(['title', 'status', 'code', 'instance', 'errors', 'requestId', 'detail']);
    }

    /**
     * One `errors` entry.
     *
     * `params` is absent unless the reason interpolates (today: too_long,
     * invalid_value), so it is not required.
     */
    private static function entry(): OpenApiTypes\ObjectType
    {
        return (new OpenApiTypes\ObjectType)
            ->addProperty('field', (new OpenApiTypes\StringType)
                ->setDescription('The camelCase name of the rejected field, as it was submitted.'))
            ->addProperty('reason', (new OpenApiTypes\StringType)
                ->enum(ErrorVocabulary::REASONS)
                ->setDescription('Stable machine token saying what is wrong with that field.'))
            ->addProperty('params', (new OpenApiTypes\ObjectType)
                ->additionalProperties(new OpenApiTypes\MixedType))
            ->setRequired(['field', 'reason']);
    }
}
