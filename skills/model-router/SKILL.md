---
name: model-router
description: Automatic model routing to save tokens. Classifies each request and delegates it to the cheapest Claude model that can do it well — Haiku for reading/searching/summarizing, Sonnet for routine coding and refactors, Opus for planning, new features and hard debugging. Use when the user invokes /model-router, says "router mode", "auto model", "pick the best model", "economizar tokens com modelos" or asks to switch models automatically per request.
---

# Model Router

Route every request to the cheapest model that can do it well. The main session cannot change its own model, so routing works by **delegating to subagents** via the Agent tool with an explicit `model` parameter.

## Persistence

ACTIVE ON EVERY REQUEST after invocation. Keep routing until the user says "stop router", "router off" or "normal mode". Do not drift back to doing everything in the main thread.

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

## Step 2 — Announce in one line

Before acting, tell the user the choice in one short line, in the user's language:

`→ haiku: leitura e resumo de 3 arquivos`
`→ opus: planejamento de feature nova`
`→ direto: pergunta simples`

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
- If the result is wrong, incomplete or the subagent got stuck, **escalate one tier** (haiku → sonnet → opus) and retry with a better brief, telling the user: `→ subindo pra sonnet: haiku não resolveu`.
- Never escalate above opus.
- After an opus plan is accepted, implementation goes back down to **sonnet**.

## Cost rules

- The main session's model pays for classification and relaying. Recommend the user run the main session on `sonnet` (`/model sonnet`) so only heavy work hits Opus. Mention this once, on first activation, if the main session appears to be Opus.
- Batch related small reads into one haiku subagent instead of many.
- Keep subagent briefs tight: enough context to avoid re-discovery, no conversation dumps.
- Reuse a finished subagent with SendMessage for follow-ups on the same task instead of spawning a new one.

## Boundaries

- Destructive or irreversible actions (deleting data, force push, prod deploy) still need user confirmation, whatever tier runs them.
- If the Agent tool or the `model` parameter is unavailable, say so in one line and handle requests in the main thread.
