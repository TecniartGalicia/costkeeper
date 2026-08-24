# CostKeeper

**What did your coding agents actually cost — per project, per model, per client.**

CostKeeper reads the history Claude Code and Codex already keep on your disk and turns it into a bill you can act on. No account, no telemetry, no network: everything is computed locally.

## Install

[VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=argalla.costkeeper) · [Open VSX](https://open-vsx.org/extension/argalla/costkeeper) (Cursor, Windsurf, VSCodium) · or `code --install-extension argalla.costkeeper`

Then run **CostKeeper: Open panel**. There is nothing to configure — the transcripts are already there.

![CostKeeper panel](https://raw.githubusercontent.com/TecniartGalicia/costkeeper/HEAD/media/shots/panel.png)

## Why the numbers here are different

Most usage extensions count one line of the transcript as one charge. That is the obvious reading, and it is wrong.

A single assistant message is written to the file several times — once per content block — each copy carrying the **full** `usage` object. On top of that, `--resume`, forks and git worktrees copy messages between files. On a real 2.5 GB history:

| | |
|---|---|
| Lines with a `usage` object | 192,262 |
| Actual messages | **92,666** |
| Cost if you count lines | $66,006 |
| Cost of the real messages | **$29,087** |

That is **127 % too much**. CostKeeper charges each `message.id` once, and when the same id appears with different usage it keeps the final state of the message.

Two more things nobody else does:

- **Cache writes are not all the same price.** Claude bills a 1-hour cache write at 2× the input rate and a 5-minute one at 1.25×. Lumping them together understates the total by 10.3 % on that same history. CostKeeper keeps them apart.
- **Reasoning tokens are already inside `output_tokens`.** Adding them again inflates the bill a second time.

## What you get

Everything below is **free**. There is no paid tier today.

- Claude Code and Codex in the same table, indexed incrementally. 4 GB of history in about 7 seconds; after that, updates are instant.
- Cost by project, model, day, branch and session — subagents counted separately.
- **Tag a project with a client**, then group and export by client. The CSV is meant to go straight into an invoice.
- Monthly budgets per project, with a notice at 50, 80 and 100 %.
- **Codex quota as published by Codex itself**: percentage used, window, reset time, plan.
- Claude's 5-hour window reconstructed from timestamps — labelled as derived, and deliberately without a percentage, because that number cannot be known.
- Status bar with today's spend for the open project.
- Unlimited history.

## Two numbers, never mixed

The dollar figure is the **API-equivalent cost**: what those tokens would have cost on pay-as-you-go. On a subscription plan it is *not* your invoice, and CostKeeper says so everywhere it shows one.

The quota figure is what you are actually consuming from your plan. Codex publishes it; Claude Code does not.

Rates ship in a dated file (`src/core/precios/tarifas.json`) and the date is shown in the panel and in every export. A model with no known rate is counted apart and reported — never estimated. Codex shows tokens and quota but no euros: there is no rate to quote, and inventing one would be exactly the mistake this extension exists to avoid.

## Privacy

The index holds no free text at all: no prompts, no code, no edited file names. The most sensitive things it stores are the project path and the branch name. Nothing leaves your machine at all: the extension makes no network request. See [PRIVACY.md](PRIVACY.md).

## Requirements

VS Code 1.95 or newer, on Windows, macOS or Linux. Claude Code or Codex installed, with some history. Nothing else.

## Not affiliated

CostKeeper is an independent tool by Argalla · Tecniart Galicia, S.L. Not affiliated with, endorsed by or sponsored by Anthropic or OpenAI. Claude and Claude Code are trademarks of Anthropic; Codex is a trademark of OpenAI.

The transcript formats it reads are not public APIs. They can change without notice; when that happens the extension keeps working and reports what it could not classify, instead of guessing.

[Español](README.es.md) · [Changelog](CHANGELOG.md) · [Issues](https://github.com/TecniartGalicia/costkeeper/issues)
