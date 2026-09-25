---
status: accepted
date: 2026-07-25
decision-makers: André Hofer
---

# Deploy by mirroring over FTP against a content-hash manifest

## Context and Problem Statement

FTP is the only way onto the host. The artifact is 6,500 to 7,000 files, most of them
Laravel's `vendor/`, and the first Laravel deploy crawled over one serial connection.

The host is unreliable under load. It drops idle control sockets and fails passive
data connections with `550`. A full recursive LIST of the remote tree takes about 30
seconds, even when nothing has changed. Its file timestamps cannot be trusted, and
comparing sizes misses a same-size edit, which is how `deployment.json` kept not
being uploaded.

How does a deploy get the artifact onto the host quickly and reliably, and decide what
to upload and what to delete?

## Considered Options

- A Node mirror over `basic-ftp`, against a content-hash manifest
- rclone, lftp or SFTP wrappers
- A single-connection GitHub action
- Upload one zip and unpack it through an endpoint
- Opt-in pruning of stale files
- A LIST of the remote tree on every deploy

## Decision Outcome

Chosen option: "A Node mirror over `basic-ftp`, against a content-hash manifest",
because a content hash catches the same-size edits that sizes miss, the manifest
spares a routine deploy the full LIST, and pooled connections that retry survive a
host that drops them.

`tools/deploy/` works like this:

- Every local file is hashed with sha256.
- `.sync-state.json` at the remote root records each deployed path's size and hash,
  and is the baseline for the next diff. A routine deploy reads that one file. A full
  parallel LIST runs only on the first deploy to a server or with `--relist`.
- Every bulk phase runs over a pool of `FTP_CONCURRENCY` connections (default 6,
  clamped to 1 to 8), and every operation retries with backoff and a reconnect.
- The state file is checkpointed, so an aborted deploy resumes.
- Stale remote files are deleted and emptied directories removed deepest-first on
  every deploy.
- A safety brake refuses, with exit code 2, a deploy that would delete more than 50
  files and more than 20% of the remote tree. `--force-delete` overrides it.

### Consequences

- Good, because routine deploys are fast and resumable.
- Good, because deletion is bounded by the manifest and the brake.
- Bad, because the tool trusts the manifest without checking it. A file uploaded by
  hand is invisible to the tool until a `--relist`.
- Bad, because nothing is atomic. The site is a mix of old and new files between the
  upload and the delete phase.
- Bad, because the first deploy to QA or PROD, where the old site still sits, will trip
  the brake. Always `--dry-run` a first deploy.

## Pros and Cons of the Options

### rclone, lftp or SFTP wrappers

- Bad, because native binaries break parity between a laptop and CI.
- Bad, because over FTP they fall back to comparing sizes.

### A single-connection GitHub action

- Bad, because one serial connection is what made the first Laravel deploy crawl.

### Upload one zip and unpack it through an endpoint

- Bad, because it trades FTP flakiness for `max_execution_time` on a shared host.

### Opt-in pruning of stale files

- Bad, because it lets Vite's hashed files pile up.

### A LIST of the remote tree on every deploy

- Bad, because a full recursive LIST takes about 30 seconds, even when nothing has
  changed.
