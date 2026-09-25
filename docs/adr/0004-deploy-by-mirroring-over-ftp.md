# 0004. Deploy by mirroring over FTP against a content-hash manifest

Status: Accepted, 2026-07-25

## Context

FTP is the only way onto the host. The artifact is 6,500 to 7,000 files, most of them
Laravel's `vendor/`, and the first Laravel deploy crawled over one serial connection.

The host is unreliable under load. It drops idle control sockets and fails passive
data connections with `550`. A full recursive LIST of the remote tree takes about 30
seconds, even when nothing has changed. Its file timestamps cannot be trusted, and
comparing sizes misses a same-size edit, which is how `deployment.json` kept not
being uploaded.

## Decision

`tools/deploy/` is a Node mirror over `basic-ftp`:

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

Rejected: rclone, lftp and SFTP wrappers (native binaries break parity between a laptop
and CI, and over FTP they fall back to comparing sizes); a single-connection GitHub
action; uploading one zip and unpacking it through an endpoint, which trades FTP
flakiness for `max_execution_time` on a shared host; opt-in pruning, which lets Vite's
hashed files pile up; and a LIST on every deploy.

## Consequences

Routine deploys are fast and resumable, and deletion is bounded by the manifest and the
brake.

The manifest is trusted, not checked. A file uploaded by hand is invisible to the tool
until a `--relist`.

Nothing is atomic. The site is a mix of old and new files between the upload and the
delete phase.

The first deploy to QA or PROD, where the old site still sits, will trip the brake.
Always `--dry-run` a first deploy.
