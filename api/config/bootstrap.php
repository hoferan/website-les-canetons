<?php

/**
 * The first administrator, for a host with no shell.
 *
 * Read through config() rather than env() at the point of use, so a test can
 * drive the migration (BootstrapAdministratorTest) and `config:cache` on a
 * server cannot leave a stale value.
 *
 * Set by hand in each server's _api/.env, like APP_KEY and the DB credentials.
 * There is no default password, and there must never be one.
 */
return [
    'admin' => [
        'username' => env('BOOTSTRAP_ADMIN_USERNAME'),
        'password' => env('BOOTSTRAP_ADMIN_PASSWORD'),
        'first_name' => env('BOOTSTRAP_ADMIN_FIRST_NAME', 'Comité'),
        'last_name' => env('BOOTSTRAP_ADMIN_LAST_NAME', 'Canetons'),
    ],
];
