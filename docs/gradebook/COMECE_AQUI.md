# Comece aqui — mapa curto para agentes

## Regra principal

**Agente de implementação só começa em issue marcada `[PRONTA]`.**

Não atribua a um agente comum:

- `#182` — painel geral do programa;
- `#184` a `#192` — acompanhamento das fases;
- `#220` — Saúde e limites, ainda planejada;
- `#229` — integração da quinta onda.

As integrações `#203`, `#210`, `#214` e `#221` já foram concluídas.

## Ondas concluídas

| Onda | Issues | Integração |
|---:|---|---|
| 1 | `#193`, `#194`, `#195` | `#203` |
| 2 | `#196`, `#198` | `#210` |
| 3 | `#197`, `#201` | `#214` |
| 4 | `#199`, `#218`, `#219` | `#221` |

A quarta onda publicou SHA-256/proveniência no importador, integrou o arredondamento acadêmico V1 e congelou as portas de persistência. Código funcional: `bc82b351026c44f2bddeb91920f61362a163f379`; deploy: `33429726281`.

## Onda 5 — executar agora, simultaneamente

| Agente | Issue | Trabalho |
|---|---:|---|
| 1 | `#226` | Composição trimestral nativa V1 |
| 2 | `#227` | Esquema e migrations D1 V1, sem provisionar produção |
| 3 | `#228` | Planejamento idempotente de reimportação e versionamento |

As três issues escrevem em áreas diferentes e podem começar juntas. A integração será feita exclusivamente pela `#229`.

## O que cada tarefa libera

```text
#226 → recuperação paralela e consolidação trimestral
#227 → adaptador D1 local/preview e bindings por ambiente
#228 → execução transacional da reimportação

#227 + #228 → promoção/versionamento persistente no D1
```

## Gates manuais que não bloqueiam a onda 5

- Executar `REAL_DATA_VALIDATION.md` com o corpus real em ambiente privado antes de fechar definitivamente a F1.
- Abrir o site oficial e importar um arquivo para conferir visualmente SHA-256, manifesto, progresso e diagnóstico da #199. O deploy e os testes passaram, mas a seleção autenticada de arquivo depende de operador.

Nunca publicar arquivos, nomes, notas, hashes ou caminhos privados.

## Fluxo visual

```text
CONCLUÍDO
#193 + #194 + #195 ──> #203
#196 + #198 ──────────> #210
#197 + #201 ──────────> #214
#199 + #218 + #219 ───> #221

AGORA
#226 ─┐
#227 ─┼──> integração #229 ──> sexta onda
#228 ─┘
```

## Instrução simples para iniciar

1. Escolha `#226`, `#227` ou `#228`.
2. Entregue somente essa issue ao agente.
3. O agente lê `AGENTS.md`, `docs/gradebook/` e a própria issue.
4. O agente executa diretamente, sem App Factory ou agentes auxiliares.
5. O agente cria branch e PR, executa `npm run verify` e registra o handoff.
6. O agente não faz merge, deploy nem altera `PROJECT_STATE.yaml`.
7. Depois das três entregas, execute a integração pela `#229`.
