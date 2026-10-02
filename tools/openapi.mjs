// Exports the Laravel API's OpenAPI document to api/openapi.json, which is
// committed and consumed by orval (see orval.config.ts).
//
// Runs through runPhp() (tools/php-runner.mjs): inside the compose `php`
// service when it is up, with the native php otherwise (Claude Code web
// sessions, CI) — the same mechanism as tools/pint.mjs.
//
// APP_KEY is a fixed dummy: exporting is static analysis over routes and
// controllers and must never need a real key to regenerate a checked-in
// artifact. APP_ENV=production disables debug-only behavior (and Scramble's
// docs UI, gated to `local`, which exporting doesn't need) without requiring
// api/.env, which normally only exists inside the container. APP_URL is
// likewise irrelevant — config/scramble.php pins an absolute server URL
// precisely so this export is byte-identical on every machine (see the CI
// drift check).
//
// DB access IS needed, despite the above: Scramble's ModelExtension infers an
// Eloquent attribute's type (e.g. Event::$date) by querying the real database
// schema (information_schema) for models that have no `@property` PHPDoc —
// see vendor/dedoc/scramble/src/Support/ResponseExtractor/ModelInfo.php. Left
// alone, that reads api/.env's DB_* — on a machine where that file carries
// real prod credentials (checked, gitignored, but sometimes present on a dev
// host for convenience) this would fire live schema queries against the
// production database from a build tool. So DB_CONNECTION/DB_DATABASE are
// forced to a throwaway SQLite file, wiped and re-migrated fresh on every run:
// schema only, zero rows, never the configured connection. This was verified
// to produce a document BYTE-IDENTICAL to one exported inside the dev
// container against real MariaDB (Scramble's column-type mapping agrees
// across drivers for the types this schema uses), and is what makes the
// export deterministic across machines instead of depending on whatever
// database happens to be configured or reachable.
//
// Usage: node tools/openapi.mjs
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { ensureApiVendor } from "./api-vendor.mjs";
import { phpTarget, runPhp } from "./php-runner.mjs";

// Only the native branch installs: in the container, api/vendor is the
// api_vendor volume, which the `php` service's entrypoint has already filled.
// A host install there would write a second vendor/ that nothing reads.
if (phpTarget() === "native") {
  ensureApiVendor({
    marker: "api/vendor/dedoc/scramble",
    label: "openapi",
    args: ["install", "--working-dir=api", "--no-interaction", "--no-progress", "--no-scripts"],
  });
}

// APP_NAME is pinned for the same reason as everything else here: determinism.
// config/scramble.php leaves `info.title` null, so Scramble falls back to
// config('app.name') — which comes from api/.env, a file that exists inside the
// dev container and on a provisioned web session but NOT on a CI runner or a
// fresh clone. Unpinned, the same commit exports "Les Canetons API" on one
// machine and Laravel's default "Laravel" on another, and the openapi-drift job
// fails for whoever regenerated it somewhere else. The value matches
// api/.env.example and docker/api/env.docker.
//
// The throwaway database sits in api/database/, which its own .gitignore keeps
// out of git (*.sqlite*). It has to be inside the repository: this script
// creates and removes it from the host, and the container sees the host only
// through the /repo bind mount. Laravel resolves the relative DB_DATABASE
// against api/, the working directory of every step below.
const SQLITE = "database/openapi-export.sqlite";
const env = {
  APP_NAME: "Les Canetons API",
  APP_KEY: "base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  APP_ENV: "production",
  DB_CONNECTION: "sqlite",
  DB_DATABASE: SQLITE,
};
const artisan = (...args) => runPhp(["php", "artisan", ...args], { cwd: "api", env });

// Registers Scramble/Sanctum's service providers into bootstrap/cache — the
// native install above runs with --no-scripts, so this hasn't happened yet.
artisan("package:discover", "--no-ansi");
// Fresh throwaway schema every run — never reuse a stale file across runs.
// This wipe-at-start is what guarantees a fresh schema even after a previous
// run crashed before reaching its own cleanup below.
rmSync(`api/${SQLITE}`, { force: true });
writeFileSync(`api/${SQLITE}`, "");
artisan("migrate", "--force");
artisan("scramble:export");
rmSync(`api/${SQLITE}`, { force: true });

// scramble:export writes the file without a trailing newline, unlike every
// other tracked JSON file in this repo (package.json, composer.json both end
// in \n). Normalised here, at the source, so every regeneration — including
// the CI drift check the next task adds — produces the same bytes a
// contributor's editor would, instead of flagging a perpetual invisible-
// character diff.
const path = "api/openapi.json";
const contents = readFileSync(path, "utf8");
if (!contents.endsWith("\n")) {
  writeFileSync(path, `${contents}\n`);
}

console.log("openapi: wrote api/openapi.json");
