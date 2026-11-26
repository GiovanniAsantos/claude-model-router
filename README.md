# claude-model-router

Plugin do [Claude Code](https://code.claude.com) que escolhe automaticamente o modelo mais barato capaz de resolver cada pedido, economizando tokens — e reporta a economia **real**, lida do transcript da sessão, não estimada.

| Pedido | Modelo |
|---|---|
| Pergunta trivial, edição de 1-2 arquivos conhecidos | sessão principal (direto) |
| Ler, buscar, resumir arquivos/docs | Haiku |
| Refatorar, corrigir, testes, implementar plano | Sonnet |
| Planejar, feature nova, arquitetura, bug difícil | Opus |

## Como funciona

A sessão principal não troca o próprio modelo. A skill classifica o pedido e delega para um subagent com `model: haiku | sonnet | opus`. Se o resultado falhar, sobe um nível carregando o que já foi descoberto. Pedido misto ("planeje e implemente") → Opus planeja, Sonnet implementa.

## Instalação

No Claude Code (CLI, VS Code, JetBrains ou claude.ai/code):

```bash
/plugin marketplace add GiovanniAsantos/claude-model-router
```

```bash
/plugin install model-router@claude-model-router
```

Requisito: `node` no PATH (usado pelo hook de economia real de tokens).

Para atualizar:

```bash
/plugin marketplace update claude-model-router
```

## Uso

```
/model-router
```

Depois disso, todo pedido é roteado. Para desligar: `stop router`. Para forçar um modelo: `usa opus nisso`.

**Dica:** rode a sessão principal em Sonnet (`/model sonnet`) — a classificação fica barata e só o trabalho pesado vai para o Opus.

## Economia real de tokens

```
/model-router-stats
```

ou pergunte "quanto economizei" / "% de economia". O hook (`hooks/hooks.json` → `scripts/stats-hook.js`) lê o transcript JSONL da própria sessão — modelo e tokens reais de cada chamada, sessão principal e subagents — e compara o custo real contra o custo se tudo tivesse rodado em Opus. Sem estimativa do modelo: o hook intercepta o pedido e responde direto.

Em turnos normais o hook só faz um check de substring no prompt e sai — não lê o transcript, custo desprezível. Só parseia o arquivo quando a frase-gatilho aparece.

Os preços usados ficam em `PRICING` no topo de `plugins/model-router/scripts/stats-hook.js` (USD por milhão de tokens) — confira contra a tabela oficial (https://docs.claude.com/en/docs/about-claude/pricing) antes de divulgar números.

## Limitações

- Subagent começa sem contexto: em tarefas minúsculas pode sair mais caro que fazer direto (por isso existe o nível "direto").
- O resultado do subagent volta resumido para a sessão principal.
- A economia reportada é só desta sessão (o transcript é por sessão); não acumula entre sessões.

## Desenvolvimento

```
.claude-plugin/marketplace.json          marketplace (lista o plugin)
plugins/model-router/
  .claude-plugin/plugin.json             manifesto do plugin
  skills/model-router/SKILL.md           regras de classificação e delegação
  hooks/hooks.json                       UserPromptSubmit -> stats-hook.js
  scripts/stats-hook.js                  leitura real do transcript + custo
```

Teste local do hook, sem precisar de uma sessão real:

```bash
echo '{"user_prompt":"/model-router-stats","transcript_path":"<sessao>.jsonl"}' | node plugins/model-router/scripts/stats-hook.js
```
