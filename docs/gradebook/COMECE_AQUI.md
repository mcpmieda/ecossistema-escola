# Comece aqui — mapa curto para agentes

## Regra principal

**Agente de implementação só começa em issue marcada `[PRONTA]`.**

Não atribua a agente comum:

- `#182` — painel geral do programa;
- `#184` a `#192` — acompanhamento das fases;
- `#220` — Saúde e limites, ainda planejada;
- `#256` — integração da oitava onda.

As integrações `#203`, `#210`, `#214`, `#221`, `#229`, `#237` e `#246` já foram concluídas.

## Onda 7 — concluída e integrada

| Issue | Entrega | PR/merge |
|---:|---|---|
| `#242` | Resultado trimestral nativo consolidado | `#252` / `b41054a` |
| `#243` | Associação transacional fonte lógica ↔ stream | `#249` / `40dd21c` |
| `#244` | Recuperação final nativa | `#253` / `fa62bdd` |

O PR combinado `#248` foi fechado sem merge. Seu conteúdo foi separado nos PRs `#252` e `#253`, restaurando uma issue e um PR por entrega. A correção está registrada na `#250`.

Código vigente da onda: `40dd21c08336919206bafcb556d6764f5570e6f9`. Deploy: `33456232765`.

## Onda 8 — executar agora, simultaneamente

| Agente | Issue | Trabalho |
|---|---:|---|
| 1 | `#245` | Adaptador D1 local de escrita e promoção transacional |
| 2 | `#254` | Restaurar regressões de isolamento da reconciliação |
| 3 | `#255` | Resultado anual, elegibilidade básica e precedências explícitas |

As três issues escrevem em áreas diferentes. A integração será feita exclusivamente pela `#256`.

## O que cada tarefa libera

```text
#245 → binding/preview D1, runner de migrations e contexto anual persistente
#254 → fechamento seguro da cobertura de regressão da F4
#255 → equivalência anual fonte × motor e base do Conselho
```

## Estado real do D1

Já existem migrations 0001–0003, 21 tabelas, leitura local, contratos de escrita e executor transacional abstrato. Ainda não existem banco/binding remoto, migration aplicada em ambiente, adaptador físico de escrita ou endpoint autorizado.

A `#245` continua exclusivamente local: não autoriza provisionamento.

## Gates manuais que não bloqueiam a onda 8

- Executar `REAL_DATA_VALIDATION.md` com o corpus real em ambiente privado antes de fechar definitivamente a F1.
- O happy path visual do manifesto foi aprovado com dois arquivos XLSB. Ainda faltam expandir o SHA-256, observar a etapa transitória de hash e conferir uma falha isolada.

Nunca publicar arquivos, nomes, notas, hashes ou caminhos privados.

## Fluxo visual

```text
CONCLUÍDO
#242 + #243 + #244 ──> integração #246

AGORA
#245 ─┐
#254 ─┼──> integração #256 ──> nona onda
#255 ─┘
```

## Instrução simples para iniciar

1. Escolha `#245`, `#254` ou `#255`.
2. Entregue somente essa issue ao agente.
3. O agente lê `AGENTS.md`, `docs/gradebook/` e a própria issue.
4. Executa diretamente, sem App Factory ou agentes auxiliares.
5. Cria branch curta e PR, executa `npm run verify` e registra o handoff.
6. Não faz merge, deploy, provisionamento nem altera `PROJECT_STATE.yaml`.
7. Depois das três entregas, execute a integração pela `#256`.
