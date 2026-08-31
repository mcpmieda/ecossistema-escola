# Comece aqui — mapa curto para agentes

## Regra principal

**Agente de implementação só começa em issue marcada `[PRONTA]`.**

Não atribua a um agente comum:

- `#182` — painel geral do programa;
- `#184` a `#192` — acompanhamento das fases;
- `#203` — integração e liberação das próximas tarefas;
- `#200` — decisão do responsável sobre armazenamento.

| Issue                              | Dificuldade | Use preferencialmente                     |
| ---------------------------------- | ----------: | ----------------------------------------- |
| **#193 — SourceContractV1**        |         3/5 | **ChatGPT Extra Alto**                    |
| **#194 — Entidades acadêmicas**    |         4/5 | **ChatGPT Extra Alto**                    |
| **#195 — Modularizar importador**  |         4/5 | **Codex**                                 |
| **#196 — Contratos de resultados** |         5/5 | **ChatGPT Extra Alto**                    |
| **#197 — Lote/Auditoria**          |         4/5 | **ChatGPT Extra Alto**                    |
| **#198 — Fixtures e testes**       |         3/5 | **Codex**                                 |
| **#199 — SHA-256/proveniência**    |         3/5 | **Codex**                                 |
| **#201 — Semântica do motor**      |         4/5 | **Codex**                                 |
| **#203 — Integração dos agentes**  |         5/5 | **ChatGPT Extra Alto**                    |
| **#200 — Escolha do banco**        |     decisão | **Extra Alto para analisar; você decide** |

## Onda 1 — executar agora, simultaneamente

| Agente | Issue | Trabalho |
|---|---:|---|
| 1 | `#193` | Contrato da fonte e das células |
| 2 | `#194` | Entidades acadêmicas |
| 3 | `#195` | Modularização do importador atual |

Essas três issues podem começar juntas.

## Onda 2 — depois das dependências

| Issue | Pode começar quando | Paralelismo |
|---:|---|---|
| `#196` | `#193` + `#194` concluídas | Pode rodar junto com `#198` |
| `#198` | `#193` + `#195` concluídas | Pode rodar junto com `#196` |

## Onda 3

| Issue | Pode começar quando | Paralelismo |
|---:|---|---|
| `#197` | `#196` concluída | Pode rodar junto com `#201` |
| `#201` | `#196` concluída | Pode rodar junto com `#197` |

## Onda 4

| Issue | Pode começar quando |
|---:|---|
| `#199` | `#197` + `#195` concluídas |

## Decisão que pode ocorrer a qualquer momento

`#200` pode ser respondida em paralelo, mas precisa estar decidida antes de implementar a persistência física.

## Fluxo visual

```text
AGORA
#193 ─┐
#194 ─┼─> #196 ─┬─> #197 ─┐
#195 ─┘          └─> #201  ├─> próximas tarefas liberadas por #203
  └────────> #198           │
#195 + #197 ─────────> #199 ┘
```

## Instrução simples para iniciar

1. Escolha uma issue da onda atual.
2. Entregue somente essa issue ao agente.
3. O agente lê `AGENTS.md`, `docs/gradebook/` e a própria issue.
4. O agente cria branch e PR, mas não faz merge.
5. O integrador acompanha tudo em `#203` e libera a onda seguinte.
