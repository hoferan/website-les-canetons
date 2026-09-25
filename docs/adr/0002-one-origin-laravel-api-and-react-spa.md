---
status: accepted
date: 2026-08-28
decision-makers: André Hofer
---

# Serve a Laravel API and a React SPA from one origin

## Context and Problem Statement

The original site was hand-rolled PHP: one front controller mixing JSON endpoints and
server-rendered pages, with no framework to stop the structure drifting. It has one
maintainer.

The host is easy-hebergement.net shared hosting. It offers FTP and nothing else: no
shell, no SSH, no cron, and the FTP account is chrooted to the web root. The Apache
version is unknown.

A Laravel API was built from July 2026. A WordPress rebuild was then tried from 07-28
and abandoned on 08-28, when the backend question was settled in Laravel's favour: 235
green tests, and TEST already serving it.

What should the site be built on, and how are its pages served?

## Considered Options

- A Laravel API and a client-rendered React SPA on one origin
- Keep the hand-rolled PHP
- A Slim or vanilla PHP rewrite
- WordPress
- Build-time prerendering
- A PHP or Twig shell per route
- An incremental route-by-route cutover
- List every SPA route in `.htaccess` to get real 404s

## Decision Outcome

Chosen option: "A Laravel API and a client-rendered React SPA on one origin", because
the Laravel API already had 235 green tests with TEST serving it, and one origin lets
Sanctum's cookie flow work without any cross-origin setup.

Two applications, one origin:

- `api/` is Laravel 13. It owns `/api/*` and `/sanctum/*` and nothing else.
- `web/` is a client-rendered React and TypeScript single-page app, built by Vite. It
  answers every other path with `index.html` and hashed assets.

Apache splits the traffic before either application runs
([ADR-0003](0003-laravel-inside-the-document-root-behind-htaccess.md)). There is no
PHP outside `api/`, and no server rendering of pages.

### Consequences

- Good, because one origin means no CORS, and Sanctum's cookie flow works without any
  cross-origin setup ([ADR-0010](0010-session-cookie-is-the-only-credential.md)).
- Bad, because an unknown URL answers 200 with the SPA's own 404 view.
- Bad, because the chroot puts the Laravel tree physically inside the document root,
  so the `.htaccess` files are a security boundary as well as routing
  ([ADR-0003](0003-laravel-inside-the-document-root-behind-htaccess.md)).
- Bad, because the build order is load-bearing. Vite empties its output directory, so
  the SPA is built before the Laravel copy.
- Bad, because crawlers that run no JavaScript see one static French shell.
  `web/index.html` carries the metadata they read.

### Confirmation

CI's `build` job asserts that both halves of the artifact exist.

## Pros and Cons of the Options

A Slim or vanilla PHP rewrite, build-time prerendering and a PHP or Twig shell per
route were rejected along the way. No reason for them was recorded.

### Keep the hand-rolled PHP

- Bad, because one front controller mixes JSON endpoints and server-rendered pages,
  with no framework to stop the structure drifting.

### WordPress

- Bad, because it was tried from 07-28 and abandoned on 08-28, once the Laravel API
  had 235 green tests and TEST was already serving it.

The WordPress branch, its remote and its Docker volumes are deleted, and anything about
WordPress left in git history is void.

### An incremental route-by-route cutover

- Bad, because it keeps the old front end running beside the SPA. The old front end in
  `app/` was deleted up front instead.

### List every SPA route in `.htaccess`

- Good, because unknown URLs would get real 404s.
- Bad, because that list would drift from `web/src/routes.tsx`.
