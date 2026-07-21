<?php

use App\Http\JsonResponse;
use PHPUnit\Framework\TestCase;

final class JsonResponseTest extends TestCase
{
    public function testErrorBodyShape(): void
    {
        // PHP's json_encode() escapes non-ASCII by default (no JSON_UNESCAPED_UNICODE
        // flag) -- matching the exact byte output every app/api/*.php 405 block already
        // produced before this helper existed.
        $this->assertSame('{"error":"M\u00e9thode non autoris\u00e9e"}', JsonResponse::errorBody('Méthode non autorisée'));
    }
}
