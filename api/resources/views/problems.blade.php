<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <title>{{ $one ? $one['code'] : 'Problem types' }} — Les Canetons API</title>

    {{--
        Inline, and no CDN. This page is what a `type` URI resolves to, so it
        has to render on a phone, behind a corporate proxy, and with the
        network half-broken — the situations somebody is in when they are
        reading an error document in the first place. The Scalar reference can
        afford a megabyte from a CDN because it is a tool you sit down with;
        this is a page you land on mid-incident.
    --}}
    <style>
        /*
           Three states, like Scalar's own toggle: follow the system, or force
           one. The palette is defined on bare :root so the light values always
           exist; the dark media query is guarded with :not([data-theme="light"])
           so an explicit light choice wins over a dark system setting, and the
           [data-theme="dark"] block below wins in the other direction. Defining
           a colour ONLY inside a media query is how a theme toggle ends up
           working in one direction and not the other.
        */
        :root {
            color-scheme: light dark;
            --ink: #1a1a1a;
            --muted: #5a5a5a;
            --rule: #e2e2e2;
            --ground: #fdfdfc;
            --panel: #f6f6f4;
            --accent: #8a5a00;
        }

        @media (prefers-color-scheme: dark) {
            :root:not([data-theme="light"]) {
                --ink: #e8e8e6;
                --muted: #a0a09c;
                --rule: #33332f;
                --ground: #161614;
                --panel: #1e1e1b;
                --accent: #e0a83c;
            }
        }

        :root[data-theme="dark"] {
            color-scheme: dark;
            --ink: #e8e8e6;
            --muted: #a0a09c;
            --rule: #33332f;
            --ground: #161614;
            --panel: #1e1e1b;
            --accent: #e0a83c;
        }

        :root[data-theme="light"] { color-scheme: light; }

        .theme-toggle {
            position: fixed;
            top: 1rem;
            right: 1rem;
            padding: .35rem .7rem;
            border: 1px solid var(--rule);
            border-radius: .35rem;
            background: var(--panel);
            color: var(--muted);
            font: inherit;
            font-size: .8rem;
            cursor: pointer;
        }

        .theme-toggle:hover { color: var(--ink); border-color: var(--muted); }

        * { box-sizing: border-box; }

        body {
            margin: 0;
            padding: 2.5rem 1.25rem 6rem;
            background: var(--ground);
            color: var(--ink);
            font: 16px/1.65 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
        }

        main { max-width: 46rem; margin: 0 auto; }

        h1 { font-size: 1.5rem; margin: 0 0 .35rem; letter-spacing: -.01em; }

        .lede { color: var(--muted); margin: 0 0 2.5rem; }
        .lede a { color: inherit; }

        article {
            padding: 1.4rem 0;
            border-top: 1px solid var(--rule);
        }

        article:last-of-type { border-bottom: 1px solid var(--rule); }

        h2 {
            font-size: 1rem;
            margin: 0 0 .5rem;
            font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
            font-weight: 600;
        }

        h2 a { color: inherit; text-decoration: none; }
        h2 a:hover { color: var(--accent); text-decoration: underline; }

        .status {
            display: inline-block;
            margin-left: .5rem;
            padding: .05rem .45rem;
            border-radius: .25rem;
            background: var(--panel);
            color: var(--muted);
            font-size: .8rem;
            font-weight: 500;
        }

        .title { margin: 0 0 .5rem; color: var(--muted); font-style: italic; }

        .detail { margin: 0; }

        code {
            font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
            font-size: .9em;
            background: var(--panel);
            padding: .05rem .3rem;
            border-radius: .2rem;
        }

        .uri {
            margin: .7rem 0 0;
            font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
            font-size: .8rem;
            color: var(--muted);
            overflow-wrap: anywhere;
        }

        footer {
            max-width: 46rem;
            margin: 3rem auto 0;
            color: var(--muted);
            font-size: .875rem;
        }
    </style>
</head>
<body>
{{--
    Applied BEFORE the body renders, in a blocking inline script, so a reader
    who chose dark does not get a white flash on every navigation. try/catch
    because localStorage throws outright in a browser set to block site data,
    where forgetting the preference is the right fallback.
--}}
<script>
    try {
        const stored = localStorage.getItem('problems:theme');
        if (stored === 'dark' || stored === 'light') {
            document.documentElement.dataset.theme = stored;
        }
    } catch (e) { /* no stored preference; the system one applies */ }
</script>

<button class="theme-toggle" type="button" id="theme-toggle" aria-live="polite">Theme</button>

<main>
    @if ($one)
        <h1>{{ $one['code'] }}</h1>
        <p class="lede">
            One problem type of the Les Canetons API.
            <a href="/api/problems">See all of them</a>.
        </p>
    @else
        <h1>Problem types</h1>
        <p class="lede">
            Every failure this API can answer with. Each one is the <code>type</code> URI
            of an <a href="https://www.rfc-editor.org/rfc/rfc9457">RFC 9457</a> problem
            document, and the <code>code</code> member carries the same token without the
            URI around it. Branch on those, never on <code>title</code>.
        </p>
    @endif

    @foreach ($problems as $problem)
        <article>
            <h2>
                <a href="/api/problems/{{ str_replace('_', '-', $problem['code']) }}">{{ $problem['code'] }}</a>
                <span class="status">{{ $problem['status'] }}</span>
            </h2>
            <p class="title">{{ $problem['title'] }}</p>
            {{-- ESCAPED FIRST, then backticks become <code>. The details are
                 developer-written constants today, so nothing hostile can reach
                 this — but an unescaped {!! !!} over a string somebody might
                 later make dynamic is how that stops being true quietly. --}}
            <p class="detail">{!! \Illuminate\Support\Str::of(e($problem['detail']))->replaceMatches('/`([^`]+)`/', '<code>$1</code>') !!}</p>
            @if ($one)
                <p class="uri">{{ $problem['type'] }}</p>
            @endif
        </article>
    @endforeach
</main>

<footer>
    <p>
        Also available as JSON — request it with <code>Accept: application/json</code>.
        The same reference, alongside every endpoint, is in the
        <a href="/api/docs">API reference</a>.
    </p>
</footer>

<script>
    (() => {
        const root = document.documentElement;
        const button = document.getElementById('theme-toggle');

        // Three states, cycled in this order: whatever the system says, then
        // forced light, then forced dark, then back. Matching Scalar's toggle,
        // which also lets you go back to following the system rather than
        // trapping you in a choice.
        const order = [null, 'light', 'dark'];
        const label = { null: 'Theme: system', light: 'Theme: light', dark: 'Theme: dark' };

        const render = () => {
            button.textContent = label[root.dataset.theme || 'null'];
        };

        button.addEventListener('click', () => {
            const current = root.dataset.theme || null;
            const next = order[(order.indexOf(current) + 1) % order.length];

            if (next) {
                root.dataset.theme = next;
            } else {
                delete root.dataset.theme;
            }

            try {
                next ? localStorage.setItem('problems:theme', next) : localStorage.removeItem('problems:theme');
            } catch (e) { /* the choice simply does not outlive this page */ }

            render();
        });

        render();
    })();
</script>
</body>
</html>
