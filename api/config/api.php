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

];
