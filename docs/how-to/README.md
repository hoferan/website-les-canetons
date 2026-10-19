# How to

How the routine work on this repository gets done. The pages are written for
someone who knows PHP and TypeScript but has not worked on this codebase yet.

| Page | For when you want to |
| --- | --- |
| [Run the dev stacks](dev-stacks.md) | Run the site locally, and know which of the three setups answers your question |
| [Add or change an endpoint](api-endpoint.md) | Take a change from the database through the API to a page, and know which test fails if you skip a step |
| [Write a migration](migrations.md) | Change the schema or the reference data without taking a server down |
| [Deploy, promote and roll back](deploy.md) | Get a change onto TEST, QA and PROD, and get past a refused deploy |
| [Where things live](map.md) | Find a file, and know what each guard in the build protects |

The other documents cover different ground:

- [`docs/traps.md`](../traps.md) is what you need to know *before* opening a
  file: the things that cost real debugging time and that the code does not
  show.
- [`docs/adr/`](../adr/README.md) records why the code is the way it is. When
  one of these pages says "because", the full reasoning is usually an ADR.
- [`staging/README.md`](../../staging/README.md) is the server runbook.
- [`CLAUDE.md`](../../CLAUDE.md) is the condensed rule set an AI agent loads on
  every task. Everything in it applies to people as well.
