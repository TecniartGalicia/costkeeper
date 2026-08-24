# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2026-08-24

### Fixed

- The extension did nothing visible until you ran a command: it did not activate on start-up, and the status bar hid itself while the index was empty — which is exactly the state right after installing. It now activates when VS Code finishes starting, loads the existing index (a few hundred milliseconds, no scanning) and always shows a status bar entry that invites you to read the history.

## [0.1.0] - 2026-08-24

First public preview.

### Added

- Local index of Claude Code and Codex history, incremental and without a database: about 7 seconds for 4 GB, instant afterwards.
- Cost by project, model, day, branch and session, with subagents counted separately.
- Deduplication by `message.id`: a message written across several lines, or copied between files by `--resume`, forks or worktrees, is charged once. Counting lines instead overstates the total by 127 % on a real history.
- Cache writes priced by TTL — 1 hour at 2×, 5 minutes at 1.25× — which changes the total by 10.3 %.
- Codex quota as published by Codex (percentage, window, reset, plan) and Claude's 5-hour window derived from timestamps, labelled as derived and shown without a percentage.
- Status bar with today's spend for the open project.
- Client tags, CSV export with a monthly summary, monthly budgets with notices at 50/80/100 %, quota forecast, unlimited history and per-branch reports. All free in this release; the licensing code ships behind a switch that is off.
- English and Spanish.

[Unreleased]: https://github.com/TecniartGalicia/costkeeper/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/TecniartGalicia/costkeeper/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/TecniartGalicia/costkeeper/releases/tag/v0.1.0
