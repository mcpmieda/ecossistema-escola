# Comece aqui — mapa curto para agentes

## Regra principal

**Agente de implementação só começa em issue marcada `[PRONTA]`.**

Não atribua a um agente comum:

- `#182` — painel geral do programa;
- `#184` a `#192` — acompanhamento das fases;
- `#210` — integração da segunda onda;
- `#200` — decisão do responsável sobre armazenamento.

A integração anterior `#203` foi concluída após a primeira onda.

## Onda 1 — concluída e integrada

| Issue | Entrega | Integração |
|---:|---|---|
| `#193` | Contrato da fonte e das células | PR `#207` |
| `#194` | Entidades acadêmicas | PR `#208` |
| `#195` | Modularização do importador | PR `#209` |

Produção verificada no commit `17ba8b1b7941d56c094abf8121796b2b7b0f7a66`, deploy `33416970939`.

## Onda 2 — executar agora, simultaneamente

| Agente | Issue | Trabalho |
|---|---:|---|
| 1 | `#196` | Contratos de lançamentos e resultados acadêmicos |
| 2 | `#198` | Fixtures sintéticas e protocolo de validação real |

Essas duas issues podem começar juntas. A integração será feita exclusivamente pela `#210`.

## Onda 3 — depois da integração da #196

| Issue | Pode começar quando | Paralelismo |
|---:|---|---|
| `#197` | `#196` integrada | Pode rodar junto com `#201` |
| `#201` | `#196` integrada | Pode rodar junto com `#197` |

## Onda 4 já conhecida

| Issue | Pode começar quando |
|---:|---|
| `#199` | `#197` integrada; `#195` já está concluída |

## Decisão que pode ocorrer a qualquer momento

`#200` pode ser respondida em paralelo, mas precisa estar decidida antes da implementação da persistência física.

## Fluxo visual

```text
CONCLUÍDO
#193 + #194 + #195 ──> integração #203 ──> produção

AGORA
#196 ─┐
      ├──> integração #210 ──> #197 e #201 em paralelo
#198 ─┘                         │
                                └──> #199 depois de #197
```

## Instrução simples para iniciar

1. Escolha `#196` ou `#198`.
2. Entregue somente essa issue ao agente.
3. O agente lê `AGENTS.md`, `docs/gradebook/` e a própria issue.
4. O agente executa diretamente a tarefa, sem App Factory ou agentes auxiliares.
5. O agente cria branch e PR, executa `npm run verify` e registra o handoff, mas não faz merge.
6. Depois das duas entregas, execute a integração pela `#210`.
