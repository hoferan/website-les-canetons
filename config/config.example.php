<?php
// Copy to config.php and fill in real values. config.php is git-ignored.
return [
    // Deployment environment: 'dev' | 'test' | 'qa' | 'prod'. Drives the
    // non-prod corner ribbon (see App\Env / partials/env_banner.php). Anything
    // missing or unrecognised is treated as 'prod' (no ribbon), so a live
    // config.php without this key is safe.
    'env' => 'prod',
    'db' => [
        'host' => 'CHANGE_ME',
        'user' => 'CHANGE_ME',
        'pass' => 'CHANGE_ME',
        'name' => 'CHANGE_ME',
        'charset' => 'utf8mb4',
    ],
    // Authenticated SMTP (easy-hebergement). Create a real mailbox and use it
    // here. secure: 'ssl' (port 465) or 'tls' (port 587).
    'mail' => [
        'host'       => 'CHANGE_ME',
        'port'       => 465,
        'secure'     => 'ssl',
        'username'   => 'CHANGE_ME',
        'password'   => 'CHANGE_ME',
        'from_email' => 'CHANGE_ME',
        'from_name'  => 'CHANGE_ME',
    ],
];
