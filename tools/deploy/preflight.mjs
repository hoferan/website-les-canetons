// tools/deploy/preflight.mjs
// Pre-deploy safety checks: the protected-files set, the per-env target-path
// guard (the one FTP account reaches every environment), and the config.php
// key-shape check. config.php is *parsed* to an AST (php-parser) and its
// top-level `return [ ... ]` walked statically — never evaluated, so this
// needs no `php` binary and never executes a file fetched off a server. Key
// *values* never appear anywhere, so secrets can't leak into deploy output.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Engine from 'php-parser';
import { STATE_FILE } from './state.mjs';

// Files that live on the server and must never be uploaded or deleted (plus
// the state file, which this tool owns and writes separately).
export const PROTECTED = new Set(['.htaccess', 'robots.txt', 'config.php', '.htpasswd', STATE_FILE]);

// FTP_DIR must name the target env as its own path/subdomain segment, so a
// mistyped dir can never deploy to — or delete from! — the wrong environment.
const GUARDS = {
  test: /(^|[/.])test([/.]|$)/i,
  qa: /(^|[/.])qa([/.]|$)/i,
  prod: /(^|[/.])prod([/.]|$)/i,
};
export const TARGETS = Object.keys(GUARDS);

export function checkTargetDir(target, dir) {
  if (GUARDS[target].test(dir)) {
    return { ok: true };
  }
  return {
    ok: false,
    message:
      `Refusing to run: FTP_DIR="${dir}" does not look like the ${target.toUpperCase()} target. ` +
      `This account can reach other environments too, so deploy only runs against a path matching "${target}".`,
  };
}

const phpEngine = new Engine({ ast: { withPositions: false }, parser: { extractDoc: false } });

// Resolve an array-entry key node to its literal string form. PHP arrays index
// unkeyed entries by a running integer (max int key seen so far + 1, from 0),
// so we track that to stay faithful to how PHP would key a list-style array.
function literalKey(node, autoIndex) {
  if (node == null) {
    return { key: String(autoIndex.next), next: autoIndex.next + 1 };
  }
  if (node.kind === 'string') {
    return { key: String(node.value), next: autoIndex.next };
  }
  if (node.kind === 'number' && Number.isInteger(Number(node.value))) {
    const n = Number(node.value);
    return { key: String(n), next: Math.max(autoIndex.next, n + 1) };
  }
  throw new Error(`Unsupported config key: expected a string/int literal, got "${node.kind}".`);
}

// Recursively collect dotted key paths from a php-parser `array` node. An
// empty nested array contributes no keys (a branch with nothing in it).
function arrayKeyPaths(arrayNode, prefix, out) {
  const autoIndex = { next: 0 };
  for (const item of arrayNode.items) {
    if (item.kind !== 'entry' || item.unpack) {
      throw new Error(
        `Unsupported config construct: "${item.unpack ? 'spread' : item.kind}" (expected a plain array entry).`
      );
    }
    const { key, next } = literalKey(item.key, autoIndex);
    autoIndex.next = next;
    const full = prefix === '' ? key : `${prefix}.${key}`;
    if (item.value && item.value.kind === 'array') {
      arrayKeyPaths(item.value, full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

// Flatten PHP config source to a sorted list of dotted key paths (e.g.
// "db.host") — never the values. Assumes config.php is a plain literal array
// (as it always is — see config/config.example.php); any dynamic construct
// throws a clear error rather than silently under-reporting keys.
export function configKeyPathsFromSource(src, label) {
  const program = phpEngine.parseCode(src, label);
  const ret = program.children.find((n) => n.kind === 'return');
  if (!ret || !ret.expr) {
    throw new Error(`${label}: expected a top-level "return [ ... ];".`);
  }
  if (ret.expr.kind !== 'array') {
    throw new Error(`${label}: top-level return is not an array literal — cannot read config key shape statically.`);
  }
  return arrayKeyPaths(ret.expr, '', []).sort();
}

export function configKeyPaths(file) {
  return configKeyPathsFromSource(readFileSync(file, 'utf8'), file);
}

// Pure comparison of two key-path lists (example = what the code expects,
// remote = what the server has).
export function compareConfigShape(exampleKeys, remoteKeys) {
  const remoteSet = new Set(remoteKeys);
  const exampleSet = new Set(exampleKeys);
  const missing = exampleKeys.filter((k) => !remoteSet.has(k));
  const extra = remoteKeys.filter((k) => !exampleSet.has(k));
  return { ok: missing.length === 0 && extra.length === 0, missing, extra };
}

// Fetch the target's config.php and compare its key shape against
// config/config.example.php (the source of truth for what the deployed code
// expects). Best-effort on fetch: a brand-new environment has no config.php
// yet — the site can't run either way, so blocking wouldn't add protection
// there; report `skipped` and let the caller warn.
export async function checkConfigShape(client, remoteRoot) {
  const exampleKeys = configKeyPaths('config/config.example.php');
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'lc-config-'));
  const tmpConfig = path.join(tmpDir, 'config.php');
  try {
    try {
      await client.downloadTo(tmpConfig, `${remoteRoot}/config.php`);
    } catch (err) {
      return { ok: true, skipped: true, reason: err.message, missing: [], extra: [] };
    }
    return { skipped: false, ...compareConfigShape(exampleKeys, configKeyPaths(tmpConfig)) };
  } finally {
    rmSync(tmpDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}
