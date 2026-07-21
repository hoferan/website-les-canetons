<?php

namespace App\Http;

final class JsonResponse
{
    /** The JSON body for a {"error", "code", "fields"?} response — pure, no I/O, unit-testable. */
    public static function errorBody(string $message, string $code, ?array $fields = null): string
    {
        $body = ['error' => $message, 'code' => $code];
        if ($fields !== null) {
            $body['fields'] = $fields;
        }
        return json_encode($body);
    }

    /** Emits a JSON {"error", "code", "fields"?} response with the given status and exits. */
    public static function error(int $status, string $code, string $message, ?array $fields = null): never
    {
        header('Content-Type: application/json');
        http_response_code($status);
        echo self::errorBody($message, $code, $fields);
        exit;
    }

    /** Emits the standard 405 response every app/api/*.php endpoint uses on an unhandled method. */
    public static function methodNotAllowed(): never
    {
        self::error(405, 'method_not_allowed', 'Method not allowed');
    }
}
