---
description: Mostra a economia real de tokens desta sessão, lida do transcript (não estimada)
allowed-tools: Bash(node:*), Bash(ls:*), Bash(find:*)
---

Rode `${CLAUDE_PLUGIN_ROOT}/scripts/stats-hook.js` sobre o transcript desta sessão e reporte o resultado tal como ele vier — não recalcule, não estime, não arredonde diferente.

1. Ache o arquivo de transcript desta sessão: é o `.jsonl` modificado mais recentemente dentro de `~/.claude/projects/<slug-do-projeto-atual>/` (o nome da pasta é o caminho do projeto com separadores trocados por `-`). Se não achar, avise o usuário e pare — não invente números.
2. Rode:
   ```
   echo '{"user_prompt":"/model-router-stats","transcript_path":"<caminho-do-jsonl-em-estilo-windows-com-/>"}' | node "${CLAUDE_PLUGIN_ROOT}/scripts/stats-hook.js"
   ```
   Use `/` como separador no `transcript_path` mesmo no Windows (ex.: `C:/Users/.../arquivo.jsonl`) — `node` aceita, e `\` dentro de JSON precisa de escape duplo.
3. O script sempre imprime texto puro (começando com `[model-router-stats]`) com o relatório real: tokens reais por tier, custo real vs. custo se tudo fosse Opus, e `% economia`. Mostre isso ao usuário como está.
4. Se o script responder com erro de leitura do transcript ou "nenhuma chamada encontrada", repasse essa mensagem ao usuário — não substitua por um número chutado.
