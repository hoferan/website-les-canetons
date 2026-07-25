// tools/deploy/ftp.mjs
// FTP I/O layer: connection pool, retry-with-reconnect, parallel tree walk,
// and the bulk phases (list / upload / delete / sweep / verify). This is the
// ONLY module that talks to the FTP server. No printing — progress is reported
// through callbacks so the UI layer stays in charge of output.
import ftp from 'basic-ftp';
import path from 'node:path';
import { groupByDir, diffSizes, deepestFirst } from './sync.mjs';

const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
// Up to 50% extra, so parallel connections that fail together don't all retry
// in lockstep and re-collide.
const defaultJitter = (base) => Math.random() * base * 0.5;

// Run `op()`, and on failure back off (exponential + jitter), reconnect, and
// retry — up to `retries` times. This shared host is flaky under concurrency:
// idle pooled control sockets get dropped ("Timeout (control socket)") and
// passive data channels fail mid-transfer ("550 Data connection failed"), and
// without retries either one aborts the whole deploy. `onRetry(attempt)` is the
// reconnect step; it runs INSIDE the retry loop (before re-running `op`), so a
// failed reconnect is itself retried. `sleep`/`jitter` are injected so backoff
// is unit-testable without real waiting. Throws the last error once exhausted.
export async function withRetry(op, onRetry, opts = {}) {
  const { retries = 3, baseDelayMs = 300, maxDelayMs = 5000, sleep = sleepMs, jitter = defaultJitter } = opts;
  let lastErr;
  for (let attempt = 0; ; attempt++) {
    try {
      if (attempt > 0 && onRetry) {
        await onRetry(attempt);
      }
      return await op();
    } catch (err) {
      lastErr = err;
      if (attempt >= retries) {
        break;
      }
      const base = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
      await sleep(base + jitter(base));
    }
  }
  throw lastErr;
}

// Run `worker(item, index)` across up to `concurrency` cooperating workers
// pulling from a shared cursor. Pure w.r.t. I/O (worker is injected).
// Fail-fast: the first worker rejection stops new items from starting.
export async function runPool(items, concurrency, worker) {
  let next = 0;
  let failed = false;
  const runWorker = async () => {
    while (!failed) {
      const i = next++;
      if (i >= items.length) {
        return;
      }
      try {
        await worker(items[i], i);
      } catch (err) {
        failed = true;
        throw err;
      }
    }
  };
  const workers = Math.max(0, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: workers }, () => runWorker()));
}

// Work-stealing recursive directory walk. `listDir(rel, workerIndex)` returns
// the FTP list() result for the (posix, base-relative) dir `rel` ('' = base);
// the walk fans out across `concurrency` cooperating workers, each pinned to
// its own `workerIndex` (so the caller can hand each worker a dedicated FTP
// connection). Returns `{ files: Map<rel,size>, dirs: string[] }` — plain
// files, and EVERY directory discovered (including empty ones). '.'/'..' and
// non-file/non-dir entries (symlinks like cgi-bin) are skipped so deletion can
// never touch server infra. `onDir(count)` fires once per directory listed.
// Fail-fast: the first listDir rejection aborts the walk and rejects.
export async function traverseDirs(concurrency, listDir, onDir) {
  const files = new Map();
  const dirs = [];
  const queue = ['']; // base-relative dirs still to list
  let pending = 0; // dirs claimed by a worker but not yet finished
  let listed = 0;
  let failed = null;

  const worker = async (workerIndex) => {
    while (!failed) {
      if (queue.length === 0) {
        if (pending === 0) {
          return; // nothing queued and nothing in flight -> the walk is done
        }
        await new Promise((r) => setImmediate(r)); // let an in-flight list enqueue more
        continue;
      }
      const rel = queue.shift();
      pending++;
      try {
        for (const item of await listDir(rel, workerIndex)) {
          if (item.name === '.' || item.name === '..') {
            continue;
          }
          const childRel = rel ? `${rel}/${item.name}` : item.name;
          if (item.isDirectory) {
            dirs.push(childRel); // recorded even if it turns out empty
            queue.push(childRel);
          } else if (item.isFile) {
            files.set(childRel, item.size);
          }
        }
        listed++;
        if (onDir) {
          onDir(listed);
        }
      } catch (err) {
        failed = err;
        throw err;
      } finally {
        pending--;
      }
    }
  };

  const n = Math.max(1, concurrency);
  await Promise.all(Array.from({ length: n }, (_, i) => worker(i)));
  if (failed) {
    throw failed;
  }
  return { files, dirs };
}

// Open a pool of `size` freshly-connected FTP clients. If any connection
// fails, closes the ones already opened before rethrowing.
export async function openPool(size, accessOpts) {
  const clients = [];
  try {
    for (let i = 0; i < size; i++) {
      const c = new ftp.Client();
      clients.push(c);
      await c.access(accessOpts);
    }
  } catch (err) {
    clients.forEach((c) => c.close());
    throw err;
  }
  return clients;
}

// Build an `onRetry` for `withRetry` that reconnects one client and, when a
// working directory is given (uploads), restores it via ensureDir before the
// operation is retried. LIST/remove use absolute paths, so they pass no dir.
export function reconnector(client, accessOpts, restoreDir) {
  return async () => {
    client.close();
    await client.access(accessOpts);
    if (restoreDir) {
      await client.ensureDir(restoreDir);
    }
  };
}

// Run `worker(item, client, index)` over `items` across a fresh pool of up to
// `size` FTP connections, each item pinned to one free connection for its
// duration. The single parallel mechanism every bulk phase — upload, verify,
// delete — shares, so they all fan out over the same FTP_CONCURRENCY budget
// with identical connection lifecycle. Closes the pool at the end.
export async function withPool(size, accessOpts, items, worker) {
  const workers = Math.max(1, Math.min(size, items.length || 1));
  const pool = await openPool(workers, accessOpts);
  const free = [...pool];
  try {
    await runPool(items, workers, async (item, index) => {
      const c = free.pop();
      try {
        await worker(item, c, index);
      } finally {
        free.push(c);
      }
    });
  } finally {
    pool.forEach((c) => c.close());
  }
}

// Snapshot the whole remote tree, walking directories in parallel across a
// fresh pool of `concurrency` connections (one LIST round-trip per directory
// is the slowest part of an authoritative deploy on this host). Returns
// { files: Map<rel,size>, dirs: string[] } — every remote file and every
// remote directory (empty ones included).
export async function listRemote(remoteRoot, accessOpts, concurrency, onProgress) {
  const clients = await openPool(concurrency, accessOpts);
  try {
    return await traverseDirs(
      concurrency,
      (rel, i) =>
        withRetry(
          () => clients[i].list(rel ? `${remoteRoot}/${rel}` : remoteRoot),
          reconnector(clients[i], accessOpts)
        ),
      onProgress
    );
  } finally {
    clients.forEach((c) => c.close());
  }
}

// Upload `toUpload` ([{rel, size}]) across up to `workers` resilient
// connections, grouped by directory (one ensureDir per folder). Calls
// `onDone(rel, size)` after each file lands. Throws (after retries) only on a
// hard failure. uploadFrom re-sends the whole file, so a retry just
// overwrites; on reconnect the working directory is restored first.
export async function uploadFiles(toUpload, localRoot, remoteRoot, accessOpts, workers, onDone) {
  const batches = [...groupByDir(toUpload).entries()];
  await withPool(workers, accessOpts, batches, async ([d, files], c) => {
    const remoteDir = d === '.' ? remoteRoot : `${remoteRoot}/${d}`;
    await withRetry(() => c.ensureDir(remoteDir), reconnector(c, accessOpts));
    for (const f of files) {
      await withRetry(
        () => c.uploadFrom(path.join(localRoot, f.rel), path.posix.basename(f.rel)),
        reconnector(c, accessOpts, remoteDir)
      );
      onDone(f.rel, f.size);
    }
  });
}

// Delete stale FILES in parallel (FTP has no recursive delete; per-file DELEs
// are spread across the pool grouped by directory — same fan-out as uploads).
// State-file-based deletion may target a file the server already lost, so a
// terminal 550 ("not found") counts as already gone instead of failing the
// mirror. Calls `onDeleted(count)` as files go. Returns the count deleted.
export async function deleteFiles(stale, remoteRoot, accessOpts, concurrency, onDeleted) {
  const batches = [...groupByDir(stale.map((rel) => ({ rel }))).entries()];
  let deleted = 0;
  await withPool(concurrency, accessOpts, batches, async ([, files], c) => {
    for (const f of files) {
      try {
        await withRetry(() => c.remove(`${remoteRoot}/${f.rel}`), reconnector(c, accessOpts), { retries: 1 });
      } catch (err) {
        if (err?.code === 550) {
          // 550 also covers rare permission-denied cases, but treating it as
          // already-gone is the spec'd trade-off: a survivor stays on the
          // server and is re-detected as stale by the next --relist.
          continue; // already gone — the goal state is reached either way
        }
        throw err;
      }
      onDeleted(++deleted);
    }
  });
  return deleted;
}

// Try to RMD every candidate directory DEEPEST-FIRST on one connection: a
// child is always attempted before its parent, so an entire empty subtree
// collapses inside-out in one pass (FTP can only delete EMPTY directories). A
// dir that still holds a surviving/protected file returns 550 and is skipped.
// Serial by design (children-before-parents ordering; cleanup, not the hot
// path). Calls `onSwept(attempted, removed)`. Returns the number removed.
export async function sweepEmptyDirs(dirs, remoteRoot, accessOpts, client, onSwept) {
  const ordered = deepestFirst(dirs);
  let removed = 0;
  let attempted = 0;
  for (const d of ordered) {
    attempted++;
    try {
      await withRetry(() => client.removeEmptyDir(`${remoteRoot}/${d}`), reconnector(client, accessOpts), {
        retries: 1,
      });
      removed++;
    } catch (err) {
      if (err?.code !== 550) {
        throw err; // a real failure (connection/auth), not "still non-empty"
      }
      // 550: still non-empty (a surviving or protected file) — leave it.
    }
    if (onSwept) {
      onSwept(attempted, removed);
    }
  }
  return removed;
}

// Verify the files we just uploaded WITHOUT re-walking the whole tree: LIST
// only the distinct directories we uploaded into (bounded by the change set),
// collect their file sizes, and diffSizes against what we sent. Uses the same
// LIST-based sizes the deploy already trusts (no reliance on FTP SIZE).
export async function verifyUploaded(remoteRoot, accessOpts, concurrency, uploaded) {
  const dirs = [...groupByDir(uploaded).keys()];
  const remoteSizes = new Map();
  await withPool(concurrency, accessOpts, dirs, async (d, c) => {
    const dirPath = d === '.' ? remoteRoot : `${remoteRoot}/${d}`;
    const items = await withRetry(() => c.list(dirPath), reconnector(c, accessOpts));
    for (const it of items) {
      if (it.isFile) {
        remoteSizes.set(d === '.' ? it.name : `${d}/${it.name}`, it.size);
      }
    }
  });
  return diffSizes(uploaded, remoteSizes);
}
