# Privacy

CostKeeper is local software. It does not collect telemetry, it has no account and it makes no network request other than the licence check described below.

## What it reads

The transcripts your agents already write on this computer:

- `~/.claude/projects/**/*.jsonl`
- `~/.codex/sessions/**/rollout-*.jsonl`
- any extra folder listed in `costkeeper.rutasExtra`

Always read-only. CostKeeper never modifies or deletes anything belonging to Claude Code or Codex.

## What it stores

An index inside the extension's global storage. Each entry is one message and holds **only**:

message id · provider · timestamp · project path · branch name · session id · subagent yes/no · model name · six token counters · the file it came from.

There is no field for free text. Prompts, answers, file contents and edited file names are read to find the token counters and then discarded. A test seeds a marker string into a fixture prompt and fails if it ever appears in the index or in an export.

## What leaves your computer

Nothing, unless you buy Pro. When you enter a licence key, these go to Polar (the merchant of record) to activate and validate it:

- the licence key,
- this computer's host name, as the activation label,
- your operating system and the extension version.

No project name, no path, no figure from your history. Validation is repeated at most once a day and works offline for 14 days.

## Exports

A CSV you export contains aggregates: the grouping key (project, client, model, day, branch or session) and numbers. If you group by project, the CSV contains project paths, because that is what you asked for.

## Diagnostics

The CostKeeper output channel logs counts and shortened paths. It never logs transcript content or licence keys.

Questions: info@tecniartgalicia.com
