<?php

namespace App\Support\Scramble;

use Dedoc\Scramble\Support\Generator\Types as OpenApiTypes;

/**
 * Builds the OpenAPI schema for App\Exceptions\ApiError's response body:
 *
 *     {"error": "...", "code": "...", "fields": [{"field", "reason", "params"?}]}
 *
 * One builder, three extensions, so the documented contract cannot differ
 * between statuses. ApiError is the authority on the shape; this only describes
 * it, and Tests\Feature\OpenApiDocumentTest pins the two together.
 */
final class ErrorResponseSchema
{
    /** @param  string[]  $codes  the `code` values this status can carry */
    public static function schema(array $codes, bool $withFields = false): OpenApiTypes\ObjectType
    {
        $body = (new OpenApiTypes\ObjectType)
            ->addProperty('error', (new OpenApiTypes\StringType)
                ->setDescription('English message. Never displayed: the front end renders `code`.'))
            ->addProperty('code', (new OpenApiTypes\StringType)
                ->enum($codes)
                ->setDescription('Stable machine token the front end maps to French.'))
            ->setRequired(['error', 'code']);

        if (! $withFields) {
            return $body;
        }

        // `params` is absent unless the reason interpolates (today: too_long,
        // invalid_value), so it is deliberately NOT in required.
        $field = (new OpenApiTypes\ObjectType)
            ->addProperty('field', new OpenApiTypes\StringType)
            ->addProperty('reason', new OpenApiTypes\StringType)
            ->addProperty('params', (new OpenApiTypes\ObjectType)
                ->additionalProperties(new OpenApiTypes\MixedType))
            ->setRequired(['field', 'reason']);

        // Unlike `params`, `fields` itself IS required here: ApiError::validation()
        // always populates at least one entry (rule failures, or the closure-error
        // fallback), so a real 400 body always carries it. Only this branch adds
        // it to `required` — the 401/403 shape has no `fields` property at all.
        return $body
            ->addProperty('fields', (new OpenApiTypes\ArrayType)->setItems($field))
            ->addRequired(['fields']);
    }
}
