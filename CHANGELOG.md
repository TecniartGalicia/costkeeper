# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.1] - 2026-08-24

A full audit of 0.2.0 — invariants over a real 91,000-message index, the webview driven in a browser, hostile inputs, and a privacy sweep with canary strings. Five findings, all fixed. The privacy sweep found nothing: 13 checks, no canary anywhere in the index, on disk or in any export.

### Fixed

- **Removing a filter did nothing in English.** The chip sent the *translated* axis name back to the extension, which only understands its internal keys. It worked in Spanish by coincidence.
- **The search box lost focus on every keystroke**, so nothing past the first letter reached it. The input is now preserved across repaints instead of being rebuilt.
- **An exclusion pattern without wildcards matched anywhere in the path**, so excluding your home folder emptied the whole panel. A pattern with no `*` now means that path or anything inside it; use `*` for the rest.
- **A pattern with many wildcards froze the interface** — 60 of them took 56 seconds through a regular expression. Matching is now linear, with no backtracking.
- **An absurd token count in a transcript turned the whole total into `Infinity`** (measured with 1e308). Counters above a sane ceiling are discarded like any other bad value.

### Added

- `npm run audit:panel` drives the real webview in a browser and checks focus, click-to-filter and filter removal. It runs in CI.

## [0.2.0] - 2026-08-24

The 0.1.x proved the numbers were right. This one is about being able to look at them: on a real history of 288 projects, the panel showed eight and let you click none.

### Added

- **Click any row to filter** the whole panel by that project, model, client or session, with a chip per active filter.
- **Search and «show all»** in every table. On the reference history the top 8 projects hid 280 rows worth $8,203.
- **Comparison with the previous period** — same number of days, immediately before, no overlap.
- **Most expensive sessions**, identified by project and dates instead of a session id.
- **Subagents toggle** in the panel.
- **Automatic refresh**: every five minutes while the panel is visible, and when the window regains focus.
- Command **Set the rate for a model**, which lists first the models in your history that have no price (Codex, typically) instead of asking you to write JSON by hand.
- Setting `costkeeper.excluirProyectos` to keep scratch folders out of the view. The index keeps everything: removing the pattern brings the data back.

### Changed

- `HEAD` is no longer treated as a branch. Claude Code writes it when it cannot resolve one — on the reference history that was $28,148 of $29,127 in a single fake row. Those messages now count as «no branch», and the card says how many there are.
- Rows below 1% of the total fold into an «others» row that always shows its amount. Exports never fold.

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

[Unreleased]: https://github.com/TecniartGalicia/costkeeper/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/TecniartGalicia/costkeeper/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/TecniartGalicia/costkeeper/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/TecniartGalicia/costkeeper/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/TecniartGalicia/costkeeper/releases/tag/v0.1.0
