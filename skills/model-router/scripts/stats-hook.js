#!/usr/bin/env node
// UserPromptSubmit hook: real token-usage report for model-router.
// Cheap on every turn (one substring check), only reads the transcript
// when the trigger phrase matches. Blocks the prompt and shows the
// report directly — the model is not involved in computing numbers.

// Preco por milhao de tokens (input/output), em USD. AJUSTAR conforme
// tabela oficial: https://docs.claude.com/en/docs/about-claude/pricing
const PRICING = {
  haiku:  { in: 1,  out: 5 },
  sonnet: { in: 3,  out: 15 },
  opus:   { in: 15, out: 75 },
};

const TRIGGERS = [
  "/model-router-stats",
  "quanto economizei",
  "quantos tokens economizei",
  "% de economia",
  "economia de tokens",
  "model router stats",
];

function tierFromModel(model) {
  if (!model) return null;
  const m = model.toLowerCase();
  if (m.includes("opus")) return "opus";
  if (m.includes("sonnet")) return "sonnet";
  if (m.includes("haiku")) return "haiku";
  return null;
}

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
  });
}

async function main() {
  const raw = await readStdin();
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  const prompt = (input.user_prompt || "").toLowerCase();
  const hit = TRIGGERS.some((t) => prompt.includes(t));
  if (!hit) process.exit(0); // no-op: zero parsing cost on normal turns

  const fs = require("fs");
  let lines;
  try {
    lines = fs.readFileSync(input.transcript_path, "utf8").trim().split("\n");
  } catch (e) {
    console.log(JSON.stringify({ decision: "block", reason: `model-router-stats: nao consegui ler o transcript (${e.code || e.message}).` }));
    process.exit(0);
  }

  // tier -> { in, out, calls }  (direct = main thread, routed = subagent/sidechain)
  const buckets = { direct: {}, routed: {} };
  const bump = (scope, tier, usage) => {
    if (!tier) return;
    const b = buckets[scope][tier] || (buckets[scope][tier] = { in: 0, out: 0, calls: 0 });
    const inTok = (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0);
    b.in += inTok;
    b.out += usage.output_tokens || 0;
    b.calls += 1;
  };

  for (const line of lines) {
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    if (o.type !== "assistant" || !o.message || !o.message.usage) continue;
    const tier = tierFromModel(o.message.model);
    bump(o.isSidechain ? "routed" : "direct", tier, o.message.usage);
  }

  const cost = (tier, tok) => (tok.in / 1e6) * PRICING[tier].in + (tok.out / 1e6) * PRICING[tier].out;
  const baselineCost = (tok) => (tok.in / 1e6) * PRICING.opus.in + (tok.out / 1e6) * PRICING.opus.out;

  let actual = 0, baseline = 0, totalCalls = 0;
  const rows = [];
  for (const scope of ["direct", "routed"]) {
    for (const [tier, tok] of Object.entries(buckets[scope])) {
      actual += cost(tier, tok);
      baseline += baselineCost(tok);
      totalCalls += tok.calls;
      rows.push(`  ${scope === "direct" ? "sessao principal" : "subagente"} / ${tier}: ${tok.calls}x, ${tok.in + tok.out} tokens, $${cost(tier, tok).toFixed(4)}`);
    }
  }

  if (totalCalls === 0) {
    console.log(JSON.stringify({ decision: "block", reason: "model-router-stats: nenhuma chamada com uso de tokens encontrada nesta sessao ainda." }));
    process.exit(0);
  }

  const pct = baseline > 0 ? (1 - actual / baseline) * 100 : 0;
  const reason = [
    `model-router — uso real desta sessao (lido do transcript, nao estimado):`,
    ...rows,
    ``,
    `Custo real:     $${actual.toFixed(4)}`,
    `Baseline opus:  $${baseline.toFixed(4)}  (mesmos tokens, tudo em opus)`,
    `Economia:       ${pct.toFixed(1)}%`,
    ``,
    `Precos aproximados em PRICING no script — confira a tabela oficial antes de divulgar numeros.`,
  ].join("\n");

  console.log(JSON.stringify({ decision: "block", reason }));
  process.exit(0);
}

main();
