<!doctype html>
<html lang="en">
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

{{--
    PINNED TO A VERSION, and carrying an integrity hash. Both were added on
    2026-09-11 and both matter more now that this page is public by default.

    It used to load the bare package path, which jsdelivr resolves to whatever
    Scalar publishes as `latest` — a 3.7 MB third-party bundle, re-resolved on
    every visit. That is how an "Ask AI" button, a "Deploy" menu, MCP server
    generation and a GitHub import arrived on this page without anybody
    choosing them, and it is why the question "can we turn the AI features off"
    had no answer: we were not deciding what shipped. It also meant any Scalar
    release could change or break a page nobody had touched, on production.

    The integrity attribute is the other half: an unpinned script from a CDN on
    a public page executes whatever is served. With SRI the browser refuses
    anything that is not the exact bundle reviewed here.

    UPGRADING IS DELIBERATE, and that is the point. Bump the version, recompute
    the hash, and look at the page before committing:

        curl -s https://cdn.jsdelivr.net/npm/@scalar/api-reference@<v>/dist/browser/standalone.min.js \
          | openssl dgst -sha384 -binary | openssl base64 -A

    config/scramble.php names the same URL; the two must stay in step, and
    DocsTest asserts that they do.

    Still a CDN rather than vendored into the artifact: the bundle is 3.7 MB and
    this project rejects that weight on every FTP deploy.
--}}
<script
    src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.68.0/dist/browser/standalone.min.js"
    integrity="sha384-ayGz8N+NChlUEfR0zr5Zy3T6Q4lhcdiASJNoshS6+vxV56ZE300qfWNBjj9pqsLN"
    crossorigin="anonymous"></script>

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
        READ-ONLY ON PRODUCTION. The console below primes the CSRF cookie and
        sends credentials, so "Send" genuinely performs the request — which is
        the point of it, and is also one click from DELETE /api/v1/events/{event}
        against live data for anyone reading the reference while logged in as the
        committee. Not a vulnerability (they hold the permission, and curl
        exists), but a documentation page that destroys real records by accident.
        config/docs.php carries the argument in full.

        The flag hides the button; it does not remove the handlers below, which
        stay so that TEST and QA — where poking at endpoints is the whole point
        — behave exactly as before.
--}}
        hideTestRequestButton: {{ config('docs.interactive') ? 'false' : 'true' }},
{{--
        The toolbar carrying "Ask AI", "Ask AI Agent", "Generate MCP", "Deploy",
        "Share" and a GitHub import. Scalar's own default is "localhost", so it
        was already absent from every deployed environment — but it was present
        here, on a developer's machine, purely because Scalar decided it should
        be. "never" makes that a decision of ours.

        There is no per-feature switch: the bundle has no hideAskAi or anything
        like it, and the AI strings live under this toolbar's translations. So
        this flag plus the pinned version above are the whole of the answer to
        "can the AI features be turned off" — one removes the surface, the other
        stops a future release from reintroducing it unasked.
--}}
        showDeveloperTools: 'never',
{{--
        The AI and MCP features, off. THREE separate switches, because Scalar
        surfaces them in three places and no single flag covers all of them:
        showDeveloperTools above removes the toolbar that carries "Deploy" and
        "Share", `agent` removes the "Ask AI" button from the sidebar, and `mcp`
        removes the "Generate MCP" layer. Turning off only the first leaves the
        other two on the page — measured, not assumed.

        Each defaults to ENABLED based on the URL the page is served from, so
        they were live locally and would be the moment Scalar decided a host
        qualified. Off is now our decision rather than their heuristic.
--}}
        agent: { disabled: true },
        mcp: { disabled: true },
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
