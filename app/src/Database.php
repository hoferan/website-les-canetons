<?php

namespace App;

use mysqli;
use RuntimeException;

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
