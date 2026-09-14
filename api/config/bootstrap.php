<?php

/**
 * The first administrator, for a host with no shell.
 *
 * Read through config() rather than env() directly at the point of use, so the
 * migration is drivable from a test (see BootstrapAdministratorTest) and so
 * `config:cache` on a server cannot leave it reading a stale value.
 *
 * These keys are set BY HAND in each server's _api/.env, exactly as APP_KEY and
 * the DB credentials already are. There is no default password and there must
 * never be one.
 */
return [
    'admin' => [
        'username' => env('BOOTSTRAP_ADMIN_USERNAME'),
        'password' => env('BOOTSTRAP_ADMIN_PASSWORD'),
        'first_name' => env('BOOTSTRAP_ADMIN_FIRST_NAME', 'Comité'),
        'last_name' => env('BOOTSTRAP_ADMIN_LAST_NAME', 'Canetons'),
    ],
];
