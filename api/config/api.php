<?php

return [

    /*
     * None of these keys belong in api/.env.example. The deploy pre-flight
     * compares a server's _api/.env key set against that file and refuses on
     * extra keys as well as missing ones, so an optional key there would
     * refuse every server's next deploy. Each key here has a working default,
     * so a server that has never heard of it is correct.
     *
     * The contract version lives in config/scramble.php (its only reader), and
     * the route prefix on App\Http\Middleware\ApiVersion::PREFIX, because
     * bootstrap/app.php needs it before any config is loaded.
     */

    /*
     * Retiring a version. All three are null for v1, and
     * App\Http\Middleware\ApiVersion emits no header for a null.
     *
     * The wire formats differ (RFC 9745 a structured-field Date, RFC 8594 an
     * HTTP-date, RFC 8288 a URL in angle brackets), but here each is written
     * as anything strtotime() understands, or a plain URL; the middleware
     * converts. A value it cannot parse emits nothing, since a malformed
     * Sunset would make a client stop calling on the wrong day.
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
     * Replayed public submissions (App\Http\Middleware\IdempotentWrite).
     * Constants rather than env() reads: neither is a per-server decision.
     */
    'idempotency' => [

        // How long a stored answer can be replayed. The draft
        // (draft-ietf-httpapi-idempotency-key-header) asks a server to state
        // its retention. A day covers a guest who closed the page on a stalled
        // request and came back to it.
        'retention_hours' => 24,

        // [chances, out of] that a write also deletes what has expired. The
        // host has no scheduler, so the sweep rides on traffic like Laravel's
        // session garbage collection. A test sets [100, 100] to make it certain.
        'lottery' => [2, 100],

    ],

    /*
     * The image library. tools/image-budget.mjs holds the same limits for the
     * photographs committed to the repository. The browser shrinks a photo to
     * up to three sizes before sending it, and the server only checks the
     * result (JpegInspector, ImageSet). No image extension is used: the host
     * has neither gd nor imagick, fileinfo is unverified, and decoding a
     * camera photo would exceed its memory_limit (ADR 0028).
     *
     * Constants, like the block above.
     */
    'images' => [

        // How many photos the library holds.
        'capacity' => 100,

        // How many bytes it holds, every size of every photo counted: 150 MB
        // of the host's 1000 MB database quota. Either cap refuses an upload
        // with image_library_full.
        'max_total_bytes' => 150 * 1024 * 1024,

        // 600 KB, and the longest edge in pixels, for each size. Both
        // tools/image-budget.mjs and web/src/images/shrink.ts repeat these
        // numbers; change all three together.
        'max_bytes' => 614400,
        'max_edge' => 1920,

        // How many sizes one upload carries. shrink.ts encodes 1920, 960 and
        // 480 px, fewer when the photo is smaller than a target.
        'max_parts' => 3,

        // Seconds an upload waits for the one before it to finish. Holding
        // the lock takes milliseconds and the SPA sends two uploads at most,
        // so running out of time means something is wedged. A test sets 0.
        'upload_lock_timeout' => 10,

    ],

    /*
     * The file each deploy writes into the document root, one level above
     * `_api/`, saying which commit it uploaded. GET /api/health reads it. A
     * test points this at a file of its own.
     */
    'deployment_marker' => base_path('../deployment.json'),

];
