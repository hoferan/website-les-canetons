<?php

use App\Http\JsonResponse;
use PHPUnit\Framework\TestCase;

final class JsonResponseTest extends TestCase
{
    public function testErrorBodyShape(): void
    {
        // PHP's json_encode() escapes non-ASCII by default (no JSON_UNESCAPED_UNICODE
        // flag) -- matching the exact byte output this project's endpoints already produce.
        $this->assertSame(
            '{"error":"M\\u00e9thode non autoris\\u00e9e","code":"method_not_allowed"}',
            JsonResponse::errorBody('Méthode non autorisée', 'method_not_allowed')
        );
    }

    public function testErrorBodyIncludesFieldsWhenProvided(): void
    {
        $body = JsonResponse::errorBody(
            'Invalid form submission',
            'validation_failed',
            [['field' => 'date', 'reason' => 'required']]
        );
        $this->assertSame(
            '{"error":"Invalid form submission","code":"validation_failed","fields":[{"field":"date","reason":"required"}]}',
            $body
        );
    }

    public function testErrorBodyOmitsFieldsKeyWhenNull(): void
    {
        $this->assertStringNotContainsString('"fields"', JsonResponse::errorBody('Event not found', 'event_not_found'));
    }
}
