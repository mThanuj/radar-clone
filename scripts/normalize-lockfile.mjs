/**
 * Rewrite package-lock.json `resolved` URLs to the public npm registry.
 *
 * Installing from inside the corp network records internal Artifactory mirror
 * URLs in the lockfile. Those hostnames don't resolve from GitHub Actions (so
 * `npm ci` fails with ENOTFOUND) and there's no reason to publish an internal
 * hostname in a public repo.
 *
 * The mirrors serve the same tarballs under the same package paths, so only the
 * host and Artifactory path prefix change — `integrity` hashes are untouched
 * and still verify.
 *
 * Run this after any `npm install` / `npm uninstall`:
 *   node scripts/normalize-lockfile.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

const PUBLIC = "https://registry.npmjs.org/";

const MIRRORS = [
  /https:\/\/artifacts\.apple\.com\/artifactory\/api\/npm\/[^/]+\//g,
  /https:\/\/npm\.apple\.com\//g,
];

const path = "package-lock.json";
const before = readFileSync(path, "utf8");

let after = before;
for (const pattern of MIRRORS) after = after.replace(pattern, PUBLIC);

// Fail loudly rather than writing a broken lockfile.
JSON.parse(after);

const remaining = after.match(/"resolved": "https:\/\/(?!registry\.npmjs\.org)[^"]+"/g);
if (remaining) {
  console.error(
    `Unrecognized registry host still present:\n  ${remaining.slice(0, 5).join("\n  ")}`,
  );
  process.exit(1);
}

if (after === before) {
  console.log("Lockfile already points at the public registry.");
} else {
  writeFileSync(path, after);
  const rewritten =
    (before.match(/"resolved": "https:\/\//g) ?? []).length -
    (before.match(/"resolved": "https:\/\/registry\.npmjs\.org\//g) ?? []).length;
  console.log(`Rewrote ${rewritten} resolved URLs to ${PUBLIC}`);
}
