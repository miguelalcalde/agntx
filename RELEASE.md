# Release Checklist

This project uses a safety-first release flow. Do not publish without explicit approval.

## Pre-flight checks

1. Ensure the working tree is clean for tracked files you intend to release.
2. Confirm local runtime directories are not staged:
   - `.agents/`
   - `.backlog/`
   - `.claude/`
   - `.cursor/`
3. Run verification:
   - `pnpm run build`
   - `pnpm run test`
   - `pnpm run pack:check`
4. Run secret scan:
   - `pnpm run secrets:scan` (requires `gitleaks` installed locally)

## Version and changelog

This repository uses Changesets.

1. Create changesets in feature/fix PRs:
   - `pnpm changeset`
2. Review pending changes:
   - `pnpm changeset:status`
3. Cut version and update changelog:
   - `pnpm version:packages`

## Publishing

Publishing is a separate, explicit step and must only happen after approval.
