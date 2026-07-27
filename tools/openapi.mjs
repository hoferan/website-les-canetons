// Exports the Laravel API's OpenAPI document to api/openapi.json, which is
// committed and consumed by orval (see orval.config.ts).
//
// Runs through runInPhp(), so it uses the php:8.4-cli container when a Docker
// daemon is reachable and the locally-installed php when it is not (Claude Code
// web sessions) — the same mechanism as tools/pint.mjs. It never talks to the
// compose stack, so it also works with the stack down.
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
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { runInPhp } from "./php-in-docker.mjs";

if (!existsSync("api/vendor/dedoc/scramble")) {
  console.log("openapi: api/vendor missing — installing the Laravel API dev dependencies once...");
  const install = [
    "install",
    "--working-dir=api",
    "--no-interaction",
    "--no-progress",
    "--no-scripts",
  ];
  execFileSync(process.execPath, ["tools/composer.mjs", ...install], { stdio: "inherit" });
}

const env =
  "APP_KEY=base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= " +
  "APP_ENV=production DB_CONNECTION=sqlite DB_DATABASE=/tmp/openapi-export.sqlite";

const steps = [
  // Registers Scramble/Sanctum's service providers into bootstrap/cache — the
  // composer install above runs with --no-scripts, so this hasn't happened yet.
  `${env} php artisan package:discover --no-ansi`,
  // Fresh throwaway schema every run — never reuse a stale file across runs.
  // This wipe-at-start is what guarantees a fresh schema even after a
  // previous run crashed before reaching its own cleanup below.
  "rm -f /tmp/openapi-export.sqlite && touch /tmp/openapi-export.sqlite",
  `${env} php artisan migrate --force`,
  `${env} php artisan scramble:export`,
  // Only the docker-run path auto-discards this file (container --rm); the
  // local-php fallback (Claude Code web sessions) runs against the host's
  // real /tmp, so clean up explicitly once the export has succeeded.
  "rm -f /tmp/openapi-export.sqlite",
];

try {
  runInPhp(`cd api && ${steps.join(" && ")}`);
} catch {
  process.exit(1);
}

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
