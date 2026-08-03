# 26. Versioning and Rollback

## Release version

The current application release is `v1.1.2-change7`. The root package, frontend package, and `frontend/lib/app-version.ts` must use the same version.

## Push and tag workflow

Each confirmed GitHub version release uses a semantic version tag after the commit is pushed:

```powershell
git tag -a v1.1.1 -m "Release v1.1.1"
git push origin v1.1.1
```

Use a patch increment for fixes, a minor increment for backward-compatible features, and a major increment for breaking changes.

## Change releases

Every code push increments the `change` suffix while retaining the current base version: `v1.1.1-change1`, `v1.1.1-change2`, and so on. When the suffix reaches `change30`, the following release increments the base version and resets the suffix to `change1`. The same full value is written to both package manifests and `frontend/lib/app-version.ts`, then used for the commit and annotated Git tag.

The Settings UI deliberately displays only the base version (for example, `v1.1.1`) so internal `change` suffixes do not appear to end users.

When a base version is confirmed, reset the suffix and publish the next semantic version, for example `v1.1.2`; the next unconfirmed code push becomes `v1.1.2-change1`.

## Rollback

To return to a known release, deploy the matching Git tag or inspect it locally:

```powershell
git checkout v1.1.1-change25
```

For a shared branch, prefer reverting the release commit with `git revert` instead of rewriting published history.
