# Security policy

## Reporting a vulnerability

Write to **info@tecniartgalicia.com** with "CostKeeper" in the subject, or open a [private security advisory](https://github.com/TecniartGalicia/costkeeper/security/advisories/new). Please do not open a public issue for a vulnerability.

We aim to answer within 72 hours and to ship a fix in the next patch release.

## What CostKeeper touches

- **Reads**: `~/.claude/projects/**/*.jsonl`, `~/.codex/sessions/**/rollout-*.jsonl` and any extra folder you configure. Read-only, always.
- **Writes**: its own index inside the extension's global storage, plus any CSV you explicitly export.
- **Network**: none, except the Polar licence endpoints when you enter or validate a Pro key.
- **Secrets**: the licence key is kept in VS Code's secret storage.

The index contains no free text from the transcripts: no prompts, no code, no edited file names. That is enforced by the shape of the record type and checked by a test.
