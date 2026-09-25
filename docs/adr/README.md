# Architecture decision records

One file per decision that shaped this project and would otherwise have to be pieced
together from guesswork. Each records the context, the options that were weighed, the
one chosen, and what it costs.

They explain why, not how. The code is the authority on how, and it changes; a record
that described the implementation would be wrong within a release. Where a test, a type
or a comment already enforces a decision, the record points at it rather than
repeating it.

Superpowers specs and plans are not committed, and nothing in the repository refers to
them. [0001](0001-keep-working-documents-out-of-the-repository.md) says why and where a
decision goes instead.

## Format

[MADR 4](https://adr.github.io/madr/), as [ADR-0000](0000-use-markdown-architectural-decision-records.md)
decides. Copy [`adr-template.md`](adr-template.md), name the file
`NNNN-title-with-dashes.md` with the next free number, and add a row below.

## Records

|                                                                     | Decision                                                                      |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [0000](0000-use-markdown-architectural-decision-records.md)         | Use Markdown Architectural Decision Records                                   |
| [0001](0001-keep-working-documents-out-of-the-repository.md)        | Keep working documents out of the repository                                  |
| [0002](0002-one-origin-laravel-api-and-react-spa.md)                | Serve a Laravel API and a React SPA from one origin                           |
| [0003](0003-laravel-inside-the-document-root-behind-htaccess.md)    | Put Laravel in the document root as `_api/`, behind one `.htaccess`           |
| [0004](0004-deploy-by-mirroring-over-ftp.md)                        | Deploy by mirroring over FTP against a content-hash manifest                  |
| [0005](0005-server-owned-files-never-travel-with-a-deploy.md)       | Keep server-owned files out of every deploy                                   |
| [0006](0006-deploy-test-on-merge-promote-by-tag.md)                 | Deploy TEST on merge and promote QA and PROD by tag                           |
| [0007](0007-one-build-for-every-environment.md)                     | Build once for every environment and read configuration at runtime            |
| [0008](0008-migrate-on-the-first-request-after-a-deploy.md)         | Migrate on the server, on the first request after a deploy                    |
| [0009](0009-no-scheduler-and-no-queue.md)                           | Work without a scheduler or a queue                                           |
| [0010](0010-session-cookie-is-the-only-credential.md)               | Authenticate with the same-origin session cookie only                         |
| [0011](0011-generate-the-contract-from-the-code.md)                 | Generate the API description from the code, and the client from it            |
| [0012](0012-errors-are-problem-documents-without-language.md)       | Report errors as problem documents that carry no language                     |
| [0013](0013-hold-the-api-to-public-standards.md)                    | Hold the API to public-API standards                                          |
| [0014](0014-authorize-by-permission-never-by-role.md)               | Authorize by permission, never by role                                        |
| [0015](0015-one-roster-every-member-has-an-account.md)              | Keep one roster, where every member has an account                            |
| [0016](0016-the-committee-issues-every-password.md)                 | Let the committee issue every password                                        |
| [0017](0017-trust-the-session-for-destructive-actions.md)           | Trust the session for destructive administrator actions                       |
| [0018](0018-attendance-rules.md)                                    | Answer in one tap, withdraw with a reason, undo for five minutes              |
| [0019](0019-guard-anonymous-writes.md)                              | Guard anonymous writes with a honeypot, a signed timing token and a throttle  |
| [0020](0020-registration-is-a-property-of-an-event.md)              | Make public registration a property of an event                               |
| [0021](0021-compute-the-committee-inbox.md)                         | Compute the committee inbox at read time                                      |
| [0022](0022-one-light-theme-and-vendored-components.md)             | Use one light theme, "Scène", with vendored components that alias it          |
| [0023](0023-locale-in-the-path-text-in-typed-catalogues.md)         | Put the locale in the URL and every string in two typed catalogues            |
| [0024](0024-lay-out-every-list-as-cards.md)                         | Lay out every list as cards, at every width                                   |
| [0025](0025-icons-on-controls.md)                                   | Give a control an icon only where the icon says one thing                     |
