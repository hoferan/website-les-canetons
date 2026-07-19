<?php
// Local Docker development config. Committed on purpose: it holds only
// throwaway credentials for the docker-compose `db` service — never real
// secrets. docker-compose mounts it into the web container at
// /var/www/html/config.php, so it never lives inside app/ on the host.
return [
    'env' => 'dev',
    'db' => [
        'host' => 'db',
        'user' => 'canetons',
        'pass' => 'canetons',
        'name' => 'lescanetons',
        'charset' => 'utf8mb4',
    ],
    // Local mail goes to Mailpit (no auth, no TLS). View it at localhost:8025.
    'mail' => [
        'host'       => 'mailpit',
        'port'       => 1025,
        'secure'     => '',
        'username'   => '',
        'password'   => '',
        'from_email' => 'noreply@les-canetons.localhost',
        'from_name'  => 'Les Canetons de Fribourg',
    ],
    // On locally so the feature is exercisable in dev; TEST/QA turn it on the
    // same way, PROD stays off until it's ready — see App\Features.
    'features' => [
        'souper_signup' => true,
    ],
];
