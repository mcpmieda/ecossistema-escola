# Comece aqui — mapa curto para agentes

## Regra principal

**Agente de implementação só começa em issue marcada `[PRONTA]`.**

Não atribua a um agente comum:

- `#182` — painel geral do programa;
- `#184` a `#192` — acompanhamento das fases;
- `#214` — integração da terceira onda;
- `#200` — decisão do responsável sobre armazenamento.

As integrações `#203` e `#210` já foram concluídas.

## Ondas concluídas

| Onda | Issues | Integração |
|---:|---|---|
| 1 | `#193`, `#194`, `#195` | `#203` |
| 2 | `#196`, `#198` | `#210` |

A segunda onda integrou os contratos de resultados e a suíte sintética/protocolo de validação. O código vigente foi publicado no commit `32450ac431dde3ddad1dfcbee436710eb2cd6555`, deploy `33421282101`.

## Onda 3 — executar agora, simultaneamente

| Agente | Issue | Trabalho |
|---|---:|---|
| 1 | `#197` | Contratos de lote, reconciliação e Auditoria |
| 2 | `#201` | Interpretação semântica nativa das células |

Essas duas issues escrevem em áreas diferentes e podem começar juntas. A integração será feita exclusivamente pela `#214`.

## Onda 4 já conhecida

| Issue/tarefa | Pode começar quando |
|---|---|
| `#199` — SHA-256 e proveniência | `#197` integrada; `#195` já concluída |
| composição trimestral nativa | `#201` integrada e issue pequena criada pelo integrador |
| arredondamento nativo | `#201` integrada e issue pequena criada pelo integrador |
| recuperação nativa | `#201` integrada e issue pequena criada pelo integrador |

A composição exata da quarta onda será publicada pela `#214` depois da revisão dos PRs da onda 3.

## Gate manual que não bloqueia a onda 3

A suíte sintética e o protocolo foram criados em `#198`. A execução controlada com as planilhas reais continua pendente antes do fechamento definitivo da F1. Ela deve seguir `REAL_DATA_VALIDATION.md` e nunca publicar arquivos, nomes, notas, hashes ou caminhos privados.

## Decisão que pode ocorrer a qualquer momento

`#200` pode ser respondida em paralelo, mas precisa estar decidida antes da implementação da persistência física.

## Fluxo visual

```text
CONCLUÍDO
#193 + #194 + #195 ──> #203
#196 + #198 ──────────> #210

AGORA
#197 ─┐
      ├──> integração #214 ──> quarta onda
#201 ─┘

DEPOIS
#197 integrada ──> #199
#201 integrada ──> pequenas issues do motor
```

## Instrução simples para iniciar

1. Escolha `#197` ou `#201`.
2. Entregue somente essa issue ao agente.
3. O agente lê `AGENTS.md`, `docs/gradebook/` e a própria issue.
4. O agente executa diretamente a tarefa, sem App Factory ou agentes auxiliares.
5. O agente cria branch e PR, executa `npm run verify` e registra o handoff, mas não faz merge.
6. Depois das duas entregas, execute a integração pela `#214`.
