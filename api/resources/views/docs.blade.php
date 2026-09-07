<!doctype html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <title>Les Canetons — API</title>
</head>
<body>
{{--
    Modelled on api/vendor/dedoc/scramble/resources/views/scalar.blade.php,
    which is known-good markup for this CDN build. Three things are kept from
    it and one is deliberately dropped — see below. Read that file before
    changing anything here.

    The document is fetched by URL rather than inlined, so the page is a static
    shell and the document has its own no-store response. It also means the
    servers rewrite lives in exactly one place.
--}}
<div id="app"></div>

{{-- Pinned by path, not by version: config/scramble.php names this same CDN
     entry point, so the two stay in step. Loaded from a CDN rather than
     vendored into the artifact — the Scalar bundle is over a megabyte, and
     this project rejects that kind of weight on every FTP deploy. --}}
<script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>

<script>
    const CSRF_COOKIE = 'XSRF-TOKEN';
    const CSRF_HEADER = 'X-XSRF-TOKEN';

    const cookieValue = (key) => {
        const found = document.cookie.split(';').find((c) => c.trim().startsWith(key));
        return found?.split('=')[1];
    };

    // Plant the cookie the replay below reads. Sanctum's SPA flow seeds
    // XSRF-TOKEN from this route and nothing else, so on a cold visit — which
    // is most visits to a docs page — it does not exist yet and every mutating
    // "Send" would answer 419. web/src/api/http.ts primes it the same way
    // before every mutating call.
    const primed = fetch('/sanctum/csrf-cookie', { credentials: 'include' }).catch(() => {});

    Scalar.createApiReference('#app', {
        url: '/api/docs.json',
        theme: 'laravel',
        darkMode: false,
{{--
        THE ONE THING FROM SCRAMBLE'S VIEW THAT MUST NOT BE COPIED: its
        renderer config carries a proxy URL (scramble.php sets one), and that
        view forwards the whole config through, so anyone modelling this page
        on it inherits the setting. Routing try-it through a third-party proxy
        would send request bodies off-site, lose the session cookie on the hop,
        and fail opaquely on TEST, where that proxy has no Basic Auth
        credentials. Every request here is same-origin and needs no proxy.

        A Blade comment rather than a JS one on purpose: DocsTest asserts the
        rendered page contains neither the setting's name nor the proxy host,
        so a later "restoration" while diffing against Scramble's view fails a
        test rather than shipping. The warning still lives here in the source.
--}}
        onBeforeRequest: ({ requestBuilder }) => {
            const token = cookieValue(CSRF_COOKIE);
            if (token) {
                requestBuilder.headers.set(CSRF_HEADER, decodeURIComponent(token));
            }
        },
        customFetch: async (input, init) => {
            // Await the prime so the very first request already carries the
            // token, rather than being the one that fails.
            await primed;
            // credentials: 'include' or the session cookie is not sent and
            // every authenticated endpoint answers 401.
            return window.fetch(input, { ...init, credentials: 'include' });
        },
    });
</script>
</body>
</html>
