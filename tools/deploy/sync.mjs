// tools/deploy/sync.mjs
// Pure sync/diff logic for the FTP deploy tool: local-vs-remote classification,
// the mass-delete safety brake, directory ordering, and the post-upload verify
// diff. No I/O and no printing — every function here is unit-testable alone.
import path from 'node:path';

// Parse FTP_CONCURRENCY: default 6, clamped 1..8 (stays under this host's ~10
// concurrent-connection budget; 1 = serial).
export function parseConcurrency(raw) {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) {
    return 6;
  }
  return Math.min(8, Math.max(1, n));
}

// Group [{rel, ...}] by posix parent directory ('.' for root-level files).
export function groupByDir(files) {
  const byDir = new Map();
  for (const f of files) {
    const d = path.posix.dirname(f.rel);
    if (!byDir.has(d)) {
      byDir.set(d, []);
    }
    byDir.get(d).push(f);
  }
  return byDir;
}

// FAST-PATH diff (no remote LIST): classify local files against the remote
// state file alone. `localEntries` is Map<rel, {size, hash}>; `remoteFiles` is
// the state file's `files` object (or null on bootstrap); `protectedSet` holds
// basenames that are never uploaded or deleted.
export function classify(localEntries, remoteFiles, protectedSet) {
  const remote = remoteFiles || {};
  const newFiles = [];
  const changed = [];
  let unchanged = 0;
  for (const [rel, loc] of localEntries) {
    const r = remote[rel];
    if (!r) {
      newFiles.push({ rel, size: loc.size });
    } else if (r.hash !== loc.hash) {
      changed.push({ rel, size: loc.size, remoteSize: r.size });
    } else {
      unchanged++;
    }
  }
  const localSet = new Set(localEntries.keys());
  const stale = Object.keys(remote)
    .filter((rel) => !localSet.has(rel) && !protectedSet.has(path.posix.basename(rel)))
    .sort();
  return { newFiles, changed, unchanged, stale };
}

// AUTHORITATIVE diff (--relist / bootstrap): the remote LIST is the source of
// truth for what EXISTS (so deletion is grounded in the server's real tree)
// and for byte sizes (drift check); the state file supplies content hashes.
export function classifyWithList(localEntries, remoteSizes, remoteFiles, protectedSet) {
  const remote = remoteFiles || {};
  const newFiles = [];
  const changed = [];
  let unchanged = 0;
  for (const [rel, loc] of localEntries) {
    if (!remoteSizes.has(rel)) {
      newFiles.push({ rel, size: loc.size });
      continue;
    }
    const serverSize = remoteSizes.get(rel);
    const m = remote[rel];
    if (!m || m.hash !== loc.hash || serverSize !== loc.size) {
      changed.push({ rel, size: loc.size, remoteSize: serverSize });
    } else {
      unchanged++;
    }
  }
  const localSet = new Set(localEntries.keys());
  const stale = [...remoteSizes.keys()]
    .filter((rel) => !localSet.has(rel) && !protectedSet.has(path.posix.basename(rel)))
    .sort();
  return { newFiles, changed, unchanged, stale };
}

// Mass-delete safety brake: a mirror deploy must not wipe the server because a
// broken/empty build made everything look stale. Trips only when BOTH more
// than 50 files AND more than 20% of the remote file count would be deleted.
export function brakeTrips(deleteCount, remoteFileCount) {
  return deleteCount > 50 && deleteCount > remoteFileCount * 0.2;
}

// Compare the files uploaded this run against fresh remote sizes. `uploaded`
// is [{rel, size}]; `remoteSizes` is Map<rel, size>. Reports files that did
// not land (missing) or landed at the wrong byte count (mismatched =
// truncated/partial). Remote files not in `uploaded` are ignored.
export function diffSizes(uploaded, remoteSizes) {
  const missing = [];
  const mismatched = [];
  for (const f of uploaded) {
    const remote = remoteSizes.get(f.rel);
    if (remote === undefined) {
      missing.push(f.rel);
    } else if (remote !== f.size) {
      mismatched.push({ rel: f.rel, local: f.size, remote });
    }
  }
  return { ok: missing.length === 0 && mismatched.length === 0, missing, mismatched };
}

// Directories that hold no surviving file once `deletedPaths` are removed,
// given the full pre-delete remote file list `remoteFiles` (both posix
// rel-paths). Returned deepest-first so a parent is only removed after its
// children. Used by the fast path to pick empty-dir sweep candidates.
export function emptyDirsAfterDelete(deletedPaths, remoteFiles) {
  const deletedSet = new Set(deletedPaths);
  const survivors = remoteFiles.filter((f) => !deletedSet.has(f));
  const candidates = new Set();
  for (const rel of deletedPaths) {
    let dir = path.posix.dirname(rel);
    while (dir && dir !== '.') {
      candidates.add(dir);
      dir = path.posix.dirname(dir);
    }
  }
  return deepestFirst([...candidates].filter((dir) => !survivors.some((s) => s.startsWith(`${dir}/`))));
}

// Order directories DEEPEST-FIRST (then by name), so an RMD sweep removes a
// child before its parent — the parent only becomes empty once its subdirs are
// gone. Pure. Deduplicates.
export function deepestFirst(dirs) {
  return [...new Set(dirs)].sort((a, b) => b.split('/').length - a.split('/').length || a.localeCompare(b));
}
