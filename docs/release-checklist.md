# Release checklist

A repeatable, safe release. See [publishing.md](publishing.md) for how publishing
is authorized (Trusted Publishing / OIDC).

## Before release

- [ ] `npm run typecheck`
- [ ] `npm run build`
- [ ] `npm test`
- [ ] `npm run pack:check`
- [ ] `npm run verify:install`
- [ ] `npm publish --dry-run` (only if publishing manually)
- [ ] Update `CHANGELOG.md` with the new version section
- [ ] Update `package.json` version
- [ ] Commit changes
- [ ] Push `main`
- [ ] Confirm CI is green

## Release

- [ ] Create the tag `vX.Y.Z`
- [ ] Push the tag
- [ ] Create the GitHub Release for that tag
- [ ] Confirm the release workflow publishes to npm (Actions → Release)

## After release

- [ ] `npm view @noctilucenty/continuity version`
- [ ] Clean install test:
  - `npm install -g @noctilucenty/continuity`
  - `continuity --version`
  - `continuity`
- [ ] Confirm the GitHub Release is marked "Latest" if intended

## Security

- Never paste npm tokens into chat, issues, or commits.
- Prefer Trusted Publishing (no stored token).
- If a token is ever exposed, rotate/revoke it immediately.

## Release notes policy

Every release (CHANGELOG section and GitHub Release notes) should include:

- What changed
- Tests added
- Verification (what was run and that it passed)
- Known risks

Keep it short and factual.
