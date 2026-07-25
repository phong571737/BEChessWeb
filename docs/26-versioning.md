# 26. Versioning and Rollback

## Release version

The current application release is `v1.1.1`. The root package, frontend package, and `frontend/lib/app-version.ts` must use the same version.

## Push and tag workflow

Each GitHub release should use a semantic version tag after the commit is pushed:

```powershell
git tag -a v1.1.1 -m "Release v1.1.1"
git push origin v1.1.1
```

Use a patch increment for fixes, a minor increment for backward-compatible features, and a major increment for breaking changes.

## Rollback

To return to a known release, deploy the matching Git tag or inspect it locally:

```powershell
git checkout v1.1.1
```

For a shared branch, prefer reverting the release commit with `git revert` instead of rewriting published history.
