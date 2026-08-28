# General Instructions

- Never run git commit commands on your own
- Always use the bun package manager, use bun x instead of npx
- Never start the dev server on your own, it should be run manually by the user to avoid conflicts.
- Oxlint ignores vendored shadcn components at `src/components/ui/**` — do not add `oxlint-disable` or `SAFETY:` comments inside that directory; update `components.json` or regenerate via `shadcn` instead.
