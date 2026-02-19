# Contributing

## Commit messages

This repository uses Conventional Commits enforced by `commitlint`.

Examples:

- `feat: add status summary output`
- `fix: handle missing config file`
- `chore: update release workflow docs`

## Changesets and changelog

This repository uses Changesets for versioning and changelog generation.

When your change affects users, add a changeset:

```bash
pnpm changeset
```

Useful commands:

- `pnpm changeset:status`
- `pnpm version:packages`

## Local verification

Before opening a PR:

```bash
pnpm run build
pnpm run pack:check
```

Optional local secret scan:

```bash
pnpm run secrets:scan
```

## Release safety

Do not publish without explicit approval.
Refer to `RELEASE.md` for the release checklist.
