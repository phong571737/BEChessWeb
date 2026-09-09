# Contributing to TTLab Chess Web

## Development workflow

1. Create a focused branch from the current default branch.
2. Read the relevant document in [`docs/`](docs/README.md) before changing a
   transport, persistence model, or recovery flow.
3. Keep UI changes explicit and localized; do not redesign unrelated layouts.
4. Add or update tests for behavior changes.
5. Run the validation commands below and include results in the pull request.

## Validation

```powershell
npm run build
npm run test:time-control
npm --prefix frontend run lint -- --quiet
npm --prefix frontend run build
npm --prefix frontend run test:analysis
```

For Docker changes, also run `docker compose config` and verify the service
health endpoints. Never include real secrets in commits, screenshots, or logs.

## Pull requests

Describe the problem, the files changed, behavior preserved or intentionally
changed, and the checks that passed. Keep refactors incremental and avoid
rewriting large files when extracting one responsibility is sufficient.
