# General Instructions

- Never run git commit commands on your own
- Always use the bun package manager, use bun x instead of npx
- Never start the dev server on your own, it should be run manually by the user to avoid conflicts.
- Oxlint ignores vendored shadcn components at `src/components/ui/**` — do not add `oxlint-disable` or `SAFETY:` comments inside that directory; update `components.json` or regenerate via `shadcn` instead.

# Commands

- `bun run check` – typecheck, `bun run lint` / `bun run format`, `bun run test` – vitest
- Also make sure to `bun run format` after a series of change so there is no misalignment

# PR Megre Instructins

- By default unless said after merging the PR remove the local and remote branch and git fetch --prune.

# Remote / harness

- Never add `Co-authored-by` / `Made by <harness>` lines to commits or PRs, ever.
- Node/npm are preinstalled; bun often isn't — reuse bun if present, else npm/npx.
- Skip DB setup (Neon Postgres) in remote envs; validate with `bun run check`, `lint`, `test` instead.
- If harness supports `.worktreeinclude`, use it; else symlink each listed file from main checkout into worktree.
