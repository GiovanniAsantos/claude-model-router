# claude-model-router

Skill para Claude Code que escolhe automaticamente o modelo mais barato capaz de resolver cada pedido, economizando tokens.

| Pedido | Modelo |
|---|---|
| Pergunta trivial, edição de 1 linha | sessão principal (direto) |
| Ler, buscar, resumir arquivos/docs | Haiku |
| Refatorar, corrigir, testes, implementar plano | Sonnet |
| Planejar, feature nova, arquitetura, bug difícil | Opus |

## Como funciona

A sessão principal não troca o próprio modelo. A skill classifica o pedido e delega para um subagent com `model: haiku | sonnet | opus`. Se o resultado falhar, sobe um nível. Pedido misto ("planeje e implemente") → Opus planeja, Sonnet implementa.

## Instalação

Global (vale para todos os projetos e IDEs com Claude Code):

```bash
git clone https://github.com/<seu-usuario>/claude-model-router.git
```

```bash
mkdir -p ~/.claude/skills && cp -r claude-model-router/skills/model-router ~/.claude/skills/
```

Por projeto: copie para `.claude/skills/model-router/` dentro do repositório.

## Uso

```
/model-router
```

Depois disso, todo pedido é roteado. Para desligar: `stop router`. Para forçar um modelo: `usa opus nisso`.

**Dica:** rode a sessão principal em Sonnet (`/model sonnet`) — a classificação fica barata e só o trabalho pesado vai para o Opus.

## Limitações

- Subagent começa sem contexto: em tarefas minúsculas pode sair mais caro que fazer direto (por isso existe o nível "direto").
- O resultado do subagent volta resumido para a sessão principal.
