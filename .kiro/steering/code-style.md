# Code style

- TypeScript, `strict: true`. ES modules.
- Pure functions for linking and scoring, with no I/O. Adapters and the app do the I/O.
- Core logic gets property-based tests (fast-check) as well as example tests. Linking and scoring invariants belong in properties.
- Small files, one responsibility. Prefer plain functions over classes.
- No new dependency without a reason written in the PR or spec notes.
- Secrets only from environment variables. Never commit `.env`.
