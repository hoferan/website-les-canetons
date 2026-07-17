<?php
// Copy to config.php and fill in real values. config.php is git-ignored.
return [
    'db' => [
        'host' => 'localhost',
        'user' => 'CHANGE_ME',
        'pass' => 'CHANGE_ME',
        'name' => 'CHANGE_ME',
        'charset' => 'utf8mb4',
    ],
    // Authenticated SMTP (easy-hebergement). Create a real mailbox and use it
    // here. secure: 'ssl' (port 465) or 'tls' (port 587).
    'mail' => [
        'host'       => 'mail-b.easy-hebergement.net',
        'port'       => 465,
        'secure'     => 'ssl',
        'username'   => 'CHANGE_ME',
        'password'   => 'CHANGE_ME',
        'from_email' => 'CHANGE_ME',
        'from_name'  => 'Les Canetons de Fribourg',
    ],
];
