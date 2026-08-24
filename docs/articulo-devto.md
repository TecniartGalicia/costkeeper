---
title: "Four ways to overcount what your coding agent costs"
published: true
description: "A single assistant message is written to the transcript several times, each copy carrying the full usage object. Count lines and you overstate the bill by 127%. Measured on 4.25 GB of real history."
tags: claude, ai, opensource, vscode
---

I spent a week building a cost tracker for Claude Code and Codex, and the whole time I could not make my numbers agree with anybody else's. Mine were always lower. A lot lower.

It turned out my numbers were the right ones, and the reason is worth writing down, because every mistake below is the *obvious* reading of the data.

All the figures here come from one real history on one machine: **2.52 GB of Claude Code transcripts and 1.72 GB of Codex rollouts**, 824 files. Nothing simulated.

## Where the data lives

Both agents already write everything you need, locally:

- Claude Code: `~/.claude/projects/**/*.jsonl`, one JSON object per line. Assistant lines carry `message.usage` with `input_tokens`, `output_tokens`, `cache_read_input_tokens` and a `cache_creation` object.
- Codex: `~/.codex/sessions/**/rollout-*.jsonl`, with `token_count` events and — nice touch — the real rate limits of your plan.

No API call, no account. The whole thing is a file read. Which is exactly why it feels easy, and why it is easy to get wrong.

## Overcount #1: one line is not one charge

This is the big one.

An assistant message with several content blocks — say a bit of text and two tool calls — gets written to the transcript **several times**, and every one of those lines carries the **complete** `usage` object. Not a slice of it. The whole thing.

If you sum `usage` per line, you count that message three or four times.

```
Lines with a usage object:  192,262
Actual messages:             92,666
```

**99,141 of those lines are repeats inside a single file.**

## Overcount #2: the same message lives in several files

`claude --resume`, forks, and git worktrees all copy conversation history into new transcript files. The same `message.id` shows up in two files that have different names, different sessions, sometimes different project paths.

In my history that is 440 messages. Small — half a percent — but it means deduplication has to be **global**, not per file. If you dedupe within each file and then add the files up, you still overcount.

Put #1 and #2 together and here is what it does to the bill:

| | |
|---|---|
| Cost if you count lines | **$66,006** |
| Cost if you count messages | **$29,087** |

That is **127% too much**. Not a rounding error. More than double.

The fix is four lines. Key by `message.id`, and when the same id shows up with different usage numbers — 7,326 of mine did, because the record gets rewritten while the message is still being generated — keep the one with the highest `output_tokens`, which is the message's final state:

```js
function merge(index, record) {
  const previous = index.get(record.id);
  if (!previous) { index.set(record.id, record); return; }
  if (record.output > previous.output) index.set(record.id, record);
}
```

## Overcount #3: reasoning tokens are already in the output

`output_tokens_details.thinking_tokens` and Codex's `reasoning_output_tokens` are a **breakdown** of `output_tokens`, not an addition to it. They are informative — you may want to know how much of your spend is thinking — but adding them to the total charges you twice for the most expensive kind of token there is.

## Overcount #4: Codex totals are cumulative

Codex emits a `token_count` event per turn, and `info.total_token_usage` is the running total **for the whole session**, not for that turn.

One ordinary session of mine had 119 of those events. Sum them and you report roughly sixty times the real consumption.

```
First event total:      15,574
Last event total:   15,927,387
Sum of per-turn deltas: 15,927,387   ← equals the last total, as it should
```

So: take the last total, not the sum. And watch for the total going *down*, which means the context was reset — close that stretch, add it to the base, and start accumulating again.

## And one way to undercount

Cache writes do not all cost the same. Anthropic bills a **1-hour** cache write at 2× the input rate and a **5-minute** one at 1.25×. Recent transcripts split them for you:

```json
"cache_creation": {
  "ephemeral_5m_input_tokens": 4210,
  "ephemeral_1h_input_tokens": 51160
}
```

Older ones only have the lumped `cache_creation_input_tokens`. If you treat every cache write as 5-minute, you understate the total — by **10.3%** on my history, where 722M tokens were written at 1 hour against 66M at 5 minutes. Long agent sessions lean heavily on the 1-hour cache, so this grows with exactly the usage pattern you care about.

## Two numbers that must never be mixed

The dollar figure any of these tools shows you is **API-equivalent cost**: what those tokens would have cost on pay-as-you-go. On a Max or a Plus plan, it is not your invoice and it never will be.

What you actually consume is quota, and there the two agents differ: Codex publishes its own limits in the transcript (percent used, window, reset time, plan), while Claude Code does not record them at all. You can reconstruct Claude's 5-hour window from timestamps — it opens with the first message after a 5-hour gap — but you cannot know how much of it you have burned. So don't print a percentage. Print the time left and label the thing as derived.

Guessing there is how a tool loses the user's trust the first time they compare it with reality.

## Does it perform?

Two things mattered more than I expected:

**Filter on bytes before decoding.** Transcripts contain enormous lines — base64 images, big tool outputs. Converting those to strings just to discard them cost 7 seconds of a 12-second pass. Check for `"usage"` in the raw `Buffer` first.

**Never `Buffer.concat` per chunk.** My first line splitter concatenated the pending buffer with each new chunk, which is quadratic when a single line is tens of megabytes. Codex's 1.72 GB took **37 seconds**. Collecting the chunks in an array and joining once, when the line is actually complete, brought it to **2.2 seconds**.

Full pass over 4.25 GB: about 7 seconds. Incremental updates after that, using a `(path, size, mtime, byte offset)` watermark per file: 28 milliseconds. The whole index is 3.4 MB gzipped, so there is no database anywhere in this — a compressed NDJSON file loads in 114 ms.

## The part I am least sure about

Everything above is measured. One thing is inferred: **that a repeated `message.id` means a single charge.** It follows from how the API bills, and it fits the fact that repeats carry identical or growing usage numbers. But there is no official document saying so, and if I'm wrong, my numbers are too low rather than too high.

The check that would settle it is comparing a month of usage against a real pay-as-you-go invoice. I don't have a metered account with enough traffic. If you do and you're curious, I'd genuinely like to know the answer.

## The tool

All of this is in **CostKeeper**, a free VS Code extension: both agents in one table, cost by project, model, day, branch and session, client tagging and CSV export for invoicing, real Codex quota. Local only, no account, no telemetry, and the index stores no free text at all — no prompts, no code.

- [Marketplace](https://marketplace.visualstudio.com/items?itemName=argalla.costkeeper) · [Open VSX](https://open-vsx.org/extension/argalla/costkeeper) · [source, MIT](https://github.com/TecniartGalicia/costkeeper)

But honestly, the reading of the format matters more than the tool. If you maintain one of the other trackers, take the four fixes — they're worth more to your users than anything I could add.
