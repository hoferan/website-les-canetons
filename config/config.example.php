<?php
// Copy to config.php and fill in real values. config.php is git-ignored.
return [
    // Deployment environment: 'dev' | 'test' | 'qa' | 'prod'. Drives the
    // non-prod corner ribbon (see App\Env / partials/env_banner.php). Anything
    // missing or unrecognised is treated as 'prod' (no ribbon), so a live
    // config.php without this key is safe.
    'env' => 'prod',
    'db' => [
        'host' => 'localhost',
        'user' => 'CHANGE_ME',
        'pass' => 'CHANGE_ME',
        'name' => 'CHANGE_ME',
        'charset' => 'utf8mb4',
    ],
];
