<?php

return [

    /*
     * argon2id, not bcrypt. Every member has a fresh credential (ADR 0015),
     * so there is no legacy hash forcing the older algorithm.
     *
     * argon2id needs a PHP built with argon2 support, and HashingTest fails
     * rather than letting a server fall back silently. If a host lacks it, set
     * HASH_DRIVER=bcrypt in that server's .env and record why; do not change
     * this default.
     */
    'driver' => env('HASH_DRIVER', 'argon2id'),

    /*
     * Inert while the driver is argon2id, as it is everywhere. BCRYPT_ROUNDS
     * changes nothing, for strength or for speed; the work factor that matters
     * is in the argon block below. This is why api/phpunit.xml pins
     * ARGON_MEMORY and ARGON_TIME, not BCRYPT_ROUNDS, to keep the suite fast.
     */
    'bcrypt' => [
        'rounds' => env('BCRYPT_ROUNDS', 12),
        'verify' => true,
    ],

    /*
     * PHP's own defaults, stated explicitly so a PHP upgrade cannot silently
     * change the work factor. 64 MiB and 4 passes on a single thread is the
     * OWASP-recommended floor and is affordable on shared hosting for the
     * handful of logins this application sees.
     */
    'argon' => [
        'memory' => env('ARGON_MEMORY', 65536),
        'threads' => env('ARGON_THREADS', 1),
        'time' => env('ARGON_TIME', 4),
        'verify' => true,
    ],

];
