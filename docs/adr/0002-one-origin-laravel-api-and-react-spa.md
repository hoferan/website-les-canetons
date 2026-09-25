# 0002. Serve a Laravel API and a React SPA from one origin

Status: Accepted, 2026-08-28

## Context

The original site was hand-rolled PHP: one front controller mixing JSON endpoints and
server-rendered pages, with no framework to stop the structure drifting. It has one
maintainer.

The host is easy-hebergement.net shared hosting. It offers FTP and nothing else: no
shell, no SSH, no cron, and the FTP account is chrooted to the web root. The Apache
version is unknown.

A Laravel API was built from July 2026. A WordPress rebuild was then tried from 07-28
and abandoned on 08-28, when the backend question was settled in Laravel's favour: 235
green tests, and TEST already serving it.

## Decision

Two applications, one origin:

- `api/` is Laravel 13. It owns `/api/*` and `/sanctum/*` and nothing else.
- `web/` is a client-rendered React and TypeScript single-page app, built by Vite. It
  answers every other path with `index.html` and hashed assets.

Apache splits the traffic before either application runs (ADR 0003). There is no PHP
outside `api/`, and no server rendering of pages.

Rejected along the way: keeping the hand-rolled PHP, a Slim or vanilla PHP rewrite,
WordPress, build-time prerendering, a PHP or Twig shell per route, and an incremental
route-by-route cutover. The old front end in `app/` was deleted up front rather than
kept running beside the SPA. The WordPress branch, its remote and its Docker volumes
are deleted too, and anything about WordPress left in git history is void. Listing every SPA route in `.htaccess` to get real 404s was
rejected because that list would drift from `web/src/routes.tsx`.

## Consequences

One origin means no CORS, and Sanctum's cookie flow works without any cross-origin
setup (ADR 0010).

An unknown URL answers 200 with the SPA's own 404 view.

The chroot puts the Laravel tree physically inside the document root, so the
`.htaccess` files are a security boundary as well as routing (ADR 0003).

The build order is load-bearing. Vite empties its output directory, so the SPA is
built before the Laravel copy, and CI's `build` job asserts both halves exist.

Crawlers that run no JavaScript see one static French shell. `web/index.html` carries
the metadata they read.
