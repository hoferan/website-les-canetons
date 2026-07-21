<?php

namespace App\Http;

final class JsonResponse
{
    /** The JSON body for a {"error": ...} response — pure, no I/O, unit-testable. */
    public static function errorBody(string $message): string
    {
        return json_encode(['error' => $message]);
    }

    /** Emits a JSON {"error": ...} response with the given status and exits. */
    public static function error(int $status, string $message): never
    {
        header('Content-Type: application/json');
        http_response_code($status);
        echo self::errorBody($message);
        exit;
    }

    /** Emits the standard 405 response every app/api/*.php endpoint uses on an unhandled method. */
    public static function methodNotAllowed(): never
    {
        self::error(405, 'Méthode non autorisée');
    }
}
