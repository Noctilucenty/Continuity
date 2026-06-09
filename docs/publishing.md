# Publishing

- Package name: `@noctilucenty/continuity`
- Command (bin): `continuity`
- Registry: https://registry.npmjs.org (public)

## Security first

Never paste npm tokens into chat, issues, or commits, and never write them into
`package.json`, `.npmrc` in the repo, docs, tests, or CI logs. Prefer GitHub
Trusted Publishing (below), which stores no token at all. If a token is ever
exposed, revoke it immediately at npmjs.com → Access Tokens.

## Preferred: GitHub Trusted Publishing (OIDC)

The release workflow (`.github/workflows/release.yml`) publishes to npm when a
GitHub Release is published. It uses npm Trusted Publishing: GitHub Actions
authenticates to npm over OIDC and npm issues a short-lived token for that one
run. Nothing is stored.

Why it is better:

- No npm token is stored in the repo, in GitHub secrets, or anywhere.
- Authentication is per-run and short-lived (OIDC), not a long-lived secret.
- Safer for CI/CD: a leaked repo can't leak a publish token because there isn't one.

### One-time setup on npmjs.com (required before it works)

Trusted Publishing does not work until you configure the publisher on npm:

1. Go to npmjs.com and open the package settings for **`@noctilucenty/continuity`**
   (Profile → Packages → the package → Settings).
2. Open **Trusted Publishing** (also shown as Publishing Access).
3. Add a **GitHub Actions** publisher.
4. Repository: **`Noctilucenty/Continuity`**.
5. Workflow filename: **`release.yml`**.
6. Environment: leave blank (or set `npm`/`release` only if you also add a
   matching `environment:` to the workflow job).
7. Save. The publisher now authorizes this repo's `release.yml` to publish
   `@noctilucenty/continuity`.

Until this is configured, the workflow's publish step will fail by design — npm
will not accept an unauthorized publisher.

### How a release publishes

1. Bump `package.json` version and update `CHANGELOG.md`; commit and push `main`.
2. Confirm CI is green.
3. Create a tag `vX.Y.Z` and a GitHub Release for it.
4. Publishing the Release triggers `release.yml`, which verifies the version
   matches the tag, runs typecheck/build/test/pack:check, then `npm publish
   --access public` via OIDC.

See [release-checklist.md](release-checklist.md) for the full checklist.

## Manual publish (fallback)

If you must publish by hand (Trusted Publishing not yet configured, or a hotfix):

```bash
npm run typecheck && npm run build && npm test && npm run pack:check
npm publish --dry-run        # inspect contents first
npm publish --access public  # requires npm login; 2FA prompts for an OTP
```

Prefer Trusted Publishing for anything routine. If you use a token for a manual
publish, use a short-lived Granular Access Token and revoke it afterward.
