---
name: model-router
description: Automatic model routing to save tokens. Classifies each request and delegates it to the cheapest Claude model that can do it well — Haiku for reading/searching/summarizing, Sonnet for routine coding and refactors, Opus for planning, new features and hard debugging. Use when the user invokes /model-router, says "router mode", "auto model", "pick the best model", "economizar tokens com modelos" or asks to switch models automatically per request.
---

# Model Router

Route every request to the cheapest model that can do it well. The main session cannot change its own model, so routing works by **delegating to subagents** via the Agent tool with an explicit `model` parameter.

## Persistence

ACTIVE ON EVERY REQUEST after invocation. Keep routing until the user says "stop router", "router off" or "normal mode". Do not drift back to doing everything in the main thread.

## Step 0 — Size gate (before classifying)

A fresh subagent pays a fixed cold-start cost: it re-derives context it cannot see. That cost can exceed the model-price savings on small tasks. Before picking a tier, check:
- **≤2 known files**, no multi-step reasoning → **direct**, regardless of verb. "Read this file and tell me X" on one or two known files is direct, not haiku — raising this from 1 to 2 removes most Explore-agent calls that cost more than they save.
- Expected subagent work < ~30s (single grep, one short read) → **direct** even if classification below would say haiku. Cold-start latency + tokens can exceed the saving.
- Several small independent reads/edits queued for the same turn, **with no dependency between them** → do not spawn one subagent per item. Batch into a single subagent call whose prompt lists every item.
- If item B needs item A's output → sequential, not batched. Batching only applies to independent items.

Only tasks that genuinely need isolated, uninterrupted work (so their raw tool output doesn't flood the main thread) earn a subagent.

## Step 1 — Classify the request

Pick exactly one tier. When in doubt between two tiers, pick the **cheaper** one unless the cost of a wrong answer is high (architecture, data loss, security), then pick the stronger one.

| Tier | Model | Use for |
|------|-------|---------|
| **direct** | (main session, no subagent) | Trivial: short factual question, one-line edit, follow-up on something already in context, confirming/clarifying. Spawning a subagent would cost more than answering. |
| **haiku** | `haiku` | Read, list, search, grep, summarize files or docs; explain what a file does; find where something is defined; extract data; repetitive mechanical edits with an exact recipe (rename across files, add headers, format). |
| **sonnet** | `sonnet` | Routine coding: implement from an existing plan, small/medium features with clear scope, refactors, writing tests, fixing ordinary bugs with known cause, code review of a small diff, config changes, writing docs. |
| **opus** | `opus` | Planning and design: new feature from scratch, architecture decisions, multi-module changes, ambiguous requirements, hard or intermittent bugs with unknown cause, security review, performance investigation, migration strategy. |

Signals:
- Verbs like *ler, listar, buscar, resumir, explicar, onde está, read, find, summarize* → **haiku**
- *refatorar, ajustar, corrigir, adicionar teste, implementar (plano pronto), refactor, fix, add* → **sonnet**
- *planejar, projetar, nova feature, arquitetura, por que isso falha às vezes, plan, design, architect* → **opus**
- Mixed request (e.g. "plan and implement feature X") → split it: **opus** plans, then **sonnet** implements the approved plan.
- Signals conflict (e.g. verb says haiku but scope touches many files, or "ajustar performance" with no known cause) → do not guess. Default to **sonnet**, never to opus by default — only opus if the ambiguity itself is about unknown root cause or architecture.
- A request of the same shape as one already routed this session (same verb class, same area of the code) → reuse that tier directly, skip re-classifying. If it later escalated for that shape, start the next occurrence one tier higher than the original guess.

## Step 2 — Announce (only on change)

Announce the tier in one short line, in the user's language, **only when it differs from the previous call's tier**, or it's the first routed call this session:

`→ haiku: leitura e resumo de 3 arquivos`
`→ opus: planejamento de feature nova`
`→ direto: pergunta simples`

Repeated calls at the same tier (e.g. three haiku reads in a row) stay silent — one announcement covers the streak. This matters in long sessions: 50 announcements of the same tier is pure noise.

The user can override at any time ("usa opus nisso", "force sonnet"). An explicit override always wins for that request.

## Step 3 — Delegate

For **direct**: answer in the main thread. Done.

For **haiku / sonnet / opus**: call the Agent tool with:
- `model`: `"haiku"`, `"sonnet"` or `"opus"`
- `subagent_type`: `"general-purpose"` (or `"Explore"` for read-only search on haiku; `"Plan"` for opus planning)
- `description`: 3–5 words
- `prompt`: a **self-contained** brief. The subagent starts cold and cannot see this conversation, so include:
  - the goal in one sentence
  - exact file paths, function names, errors, and constraints already known
  - what is already decided (so it does not re-derive it)
  - what to return: for haiku, the findings concisely; for sonnet, what changed and where; for opus, the plan with steps, files and trade-offs
  - respond in the user's language

Pass `run_in_background: false` when the next step depends on the result (almost always here).

Do not spawn a subagent just to read one small file you could read yourself in one call — that is **direct**.

## Step 4 — Relay and escalate

- Relay the subagent's result to the user concisely. The user does not see the subagent's report.
- If the result is wrong, incomplete or the subagent got stuck, **escalate one tier** (haiku → sonnet → opus) and retry, telling the user: `→ subindo pra sonnet: haiku não resolveu`.
  - Carry the failed subagent's partial output into the new prompt (what it found, what it tried, where it got stuck). Never restart from a blank brief — that forces the stronger model to redo discovery the cheaper one already paid for.
- Never escalate above opus.
- After an opus plan is accepted, implementation goes back down to **sonnet**.

## Cost rules

- The main session's model pays for classification and relaying. Recommend the user run the main session on `sonnet` (`/model sonnet`) so only heavy work hits Opus. Mention this once, on first activation, if the main session appears to be Opus.
- Batch related small reads into one haiku subagent instead of many.
- Keep subagent briefs tight: enough context to avoid re-discovery, no conversation dumps.
- Reuse a finished subagent with SendMessage for follow-ups on the same task instead of spawning a new one.

## Savings tracking (real, not estimated)

`scripts/stats-hook.js` is a `UserPromptSubmit` hook (registered in the user's `settings.json`) that reads the session's own transcript JSONL — the same file Claude Code writes every assistant turn to, main thread and subagents (`isSidechain`) alike, each with real `model` and `usage` token counts. No estimation, no self-reported tally.

- On every normal turn it does one cheap substring check on the prompt and exits immediately — it does not parse the transcript unless the trigger phrase is present. Negligible weight on the session.
- On trigger (`/model-router-stats`, "quanto economizei", "% de economia", etc.) it parses the transcript once, sums real input/output tokens per tier (`direct` = main session, `routed` = subagent calls) using `PRICING` constants in the script, and computes `% economia = (1 - custo_real / custo_se_tudo_fosse_opus) × 100`.
- It answers via `{"decision":"block","reason": <report>}` — the prompt never reaches the model, the user sees the real numbers straight from the hook. The model does nothing here except, if asked, explain or translate the already-computed report.
- `PRICING` in the script is an editable table (USD per million tokens); keep it matched to the current official pricing page before quoting numbers publicly.

**Fallback (only if the hook is unavailable):** hooks disabled, running outside Claude Code, or `transcript_path` missing — say so in one line, then fall back to a rough estimate: count calls per tier this session, weight them `haiku=1, sonnet=5, opus=25` (approximate price ratios), `economia_% ≈ (1 - Σcalls×weight / Σcalls×25) × 100`. Always label this explicitly as an estimate, never present it as the real number.

## Boundaries

- Destructive or irreversible actions (deleting data, force push, prod deploy) still need user confirmation, whatever tier runs them.
- If the Agent tool or the `model` parameter is unavailable, say so in one line and handle requests in the main thread.
