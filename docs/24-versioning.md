# 24. Versioning and Rollback

## Release version

The current application release is `v1.1.4-change12`. The root package, frontend package, and `frontend/lib/app-version.ts` must use the same version.

## Push and tag workflow

Each confirmed GitHub version release uses a semantic version tag after the commit is pushed:

```powershell
git tag -a v1.1.3-change7 -m "Release v1.1.3-change7"
git push origin v1.1.3-change7
```

Use a patch increment for fixes, a minor increment for backward-compatible features, and a major increment for breaking changes.

## Change releases

Every accepted code/documentation push increments the `change` suffix while retaining the current base version: `v1.1.3-change1`, `v1.1.3-change2`, and so on. The thirtieth accepted change publishes the next patch base (for example `v1.1.4`) instead of a `change30` tag; the following push begins at `v1.1.4-change1`. The same full value is written to both package manifests and `frontend/lib/app-version.ts`, then used for the commit and annotated Git tag.

The Settings UI deliberately displays only the base version (for example, `v1.1.3`) so internal `change` suffixes do not appear to end users.

When a base version is confirmed or the 30-change threshold is reached, reset the suffix and publish the next semantic version; the next code push becomes `<new-base>-change1`.

## Rollback

To return to a known release, deploy the matching Git tag or inspect it locally:

```powershell
git checkout v1.1.3
```

For a shared branch, prefer reverting the release commit with `git revert` instead of rewriting published history.
