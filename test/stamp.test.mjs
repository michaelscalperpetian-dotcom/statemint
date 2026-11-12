// Every script and stylesheet link must carry the current version tag (scripts/stamp.py), so visitors never mix a
// fresh page with an older cached script after a deploy.
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
const root = new URL("../public/", import.meta.url).pathname;
execFileSync("python3", [new URL("../scripts/stamp.py", import.meta.url).pathname, "--check"], { stdio: "inherit" });
console.log("ok - every script/style link has its current version tag");
const files = [...readdirSync(root).filter(f => f.endsWith(".html")).map(f => root + f), ...readdirSync(root + "js").map(f => root + "js/" + f)];
const untagged = files.flatMap(f => [...readFileSync(f, "utf8").matchAll(/["'](\/(?:js|css)\/[\w.-]+\.(?:js|css))["']/g)].map(m => `${f.replace(root, "")}: ${m[1]}`));
assert.deepEqual(untagged, []); console.log("ok - no untagged /js or /css links");
const urls = new Set(files.flatMap(f => [...readFileSync(f, "utf8").matchAll(/["'](\/js\/fx\.js\?v=[0-9a-f]+)["']/g)].map(m => m[1])));
assert.equal(urls.size, 1); console.log("ok - every page and script loads the same copy of fx.js (shared storage)");
console.log("\n3 version-tag checks passed");
