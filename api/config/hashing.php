<?php

return [

    /*
     * argon2id, not bcrypt. There is no legacy hash to migrate — the rebuild
     * issues every member a fresh credential (design D13) — so nothing forces
     * the older algorithm.
     *
     * NOTE FOR DEPLOYS: argon2id needs a PHP built with argon2 support.
     * HashingTest asserts it loudly rather than letting a server fall back
     * silently. If a host lacks it, set HASH_DRIVER=bcrypt in that server's
     * .env and record why — do not change this default.
     */
    'driver' => env('HASH_DRIVER', 'argon2id'),

    /*
     * INERT while the driver above is argon2id, which is every environment
     * today. Nothing in this block is reached, so a BCRYPT_ROUNDS set for
     * strength or for speed does exactly nothing — the knob that bites is in
     * the argon block below.
     *
     * Not hypothetical. api/phpunit.xml pinned BCRYPT_ROUNDS=4 to keep the
     * suite quick and it had no effect whatsoever: every Hash::make ran at the
     * argon2id production factor, 177 ms a hash, which was roughly 120 of the
     * suite's 147 seconds. Found 2026-09-18 by profiling, not by reading —
     * the pin looks like it works, and the suite passes either way. That file
     * now pins ARGON_MEMORY and ARGON_TIME instead and carries the numbers.
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
