<?php

return [

    /*
     * NONE OF THESE KEYS BELONG IN api/.env.example.
     *
     * The deploy CLI's config-shape pre-flight compares a server's _api/.env
     * key SET against that file and refuses on EXTRA keys as well as missing
     * ones. Adding an optional key there would refuse every server's next
     * deploy until somebody hand-edited three .env files. Each of these has a
     * working null default, so a server that has never heard of them is
     * correct — which is the point.
     *
     * The contract version lives in config/scramble.php (its only reader), and
     * the route prefix on App\Http\Middleware\ApiVersion::PREFIX, because
     * bootstrap/app.php needs it while building the application, before any
     * config is loaded.
     */

    /*
     * Retiring a version. All three are null for v1 and App\Http\Middleware\
     * ApiVersion emits no header for a null — so a server that has never heard
     * of these keys behaves exactly as it does today.
     *
     * The three take three different formats on the wire (RFC 9745 wants a
     * structured-field Date, RFC 8594 an HTTP-date, RFC 8288 a URL in angle
     * brackets), but all three are written HERE as anything strtotime()
     * understands, or a plain URL. The middleware does the converting.
     *
     * A value it cannot parse emits nothing rather than something wrong: a
     * malformed Sunset is worse than an absent one, because a client that
     * believes it stops calling on the wrong day.
     */
    'deprecation' => [

        // When this version became deprecated. RFC 9745 `Deprecation`.
        'at' => env('API_DEPRECATION_AT'),

        // When it stops answering. RFC 8594 `Sunset`.
        'sunset' => env('API_SUNSET_AT'),

        // Where to go instead, absolute or relative.
        // RFC 8288 `Link: rel="successor-version"`.
        'successor' => env('API_SUCCESSOR_URL'),

    ],

    /*
     * Replayed public submissions. App\Http\Middleware\IdempotentWrite.
     *
     * NOT env()-DRIVEN, unlike the block above, and for the same reason it
     * must not be: the deploy pre-flight refuses on extra keys as well as
     * missing ones, so an optional key in api/.env.example would refuse every
     * server's next deploy. Neither of these is a per-server decision anyway.
     */
    'idempotency' => [

        // How long a stored answer can be replayed. The draft
        // (draft-ietf-httpapi-idempotency-key-header) suggests a server state
        // its retention; ours is a day, which covers a guest who closed the
        // page on a stalled request and came back to it.
        'retention_hours' => 24,

        // [chances, out of] that a write also deletes what has expired. This
        // host has no scheduler, so the sweep rides on traffic the way
        // Laravel's session garbage collection does. A test sets [100, 100] to
        // make it certain.
        'lottery' => [2, 100],

    ],

];
