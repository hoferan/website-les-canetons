<?php

// This buildless app wires classes together with plain `require` includes (see
// bootstrap.php) rather than namespaced autoloading, so this class intentionally
// stays in the global namespace. Namespacing it would mean also updating every
// unqualified reference across code/**.php — out of scope for a formatting-only
// PSR-12 pass with no test coverage to verify the refactor.
// phpcs:ignore PSR1.Classes.ClassDeclaration.MissingNamespace
final class Database
{
    private static ?mysqli $conn = null;

    public static function connect(array $cfg): mysqli
    {
        if (self::$conn instanceof mysqli) {
            return self::$conn;
        }
        mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
        $conn = new mysqli($cfg['host'], $cfg['user'], $cfg['pass'], $cfg['name']);
        $conn->set_charset($cfg['charset'] ?? 'utf8mb4');
        self::$conn = $conn;
        return $conn;
    }

    public static function get(): mysqli
    {
        if (!self::$conn instanceof mysqli) {
            throw new RuntimeException('Database not connected. Did you include bootstrap.php?');
        }
        return self::$conn;
    }
}
