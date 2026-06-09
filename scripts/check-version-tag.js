#!/usr/bin/env node
"use strict";

/**
 * Version/tag guard (v0.10).
 *
 * Ensures the package.json version matches the release tag before publishing, so
 * a release can never ship a mismatched version. Used by the release workflow:
 *
 *   node scripts/check-version-tag.js "$GITHUB_REF_NAME"
 *
 * The tag may be passed as the first CLI arg, or read from GITHUB_REF_NAME.
 * A leading "v" on the tag is stripped (v0.10.0 -> 0.10.0).
 */

function normalizeTag(tag) {
  return String(tag || "").trim().replace(/^v/, "");
}

function checkVersionTag(pkgVersion, tag) {
  const t = normalizeTag(tag);
  if (!t) {
    return { ok: false, message: "No tag provided (pass an argument or set GITHUB_REF_NAME)." };
  }
  if (t === pkgVersion) {
    return { ok: true, message: `OK: package.json version ${pkgVersion} matches tag v${t}.` };
  }
  return {
    ok: false,
    message: `Version mismatch: package.json is ${pkgVersion} but the release tag is v${t}. Bump package.json (and CHANGELOG) to match, or retag.`,
  };
}

module.exports = { checkVersionTag, normalizeTag };

if (require.main === module) {
  const pkg = require("../package.json");
  const tag = process.argv[2] || process.env.GITHUB_REF_NAME;
  const result = checkVersionTag(pkg.version, tag);
  // eslint-disable-next-line no-console
  console.log(result.message);
  process.exit(result.ok ? 0 : 1);
}
