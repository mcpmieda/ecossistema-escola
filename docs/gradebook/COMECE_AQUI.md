# Comece aqui — mapa curto para agentes

## Regra principal

**Agente de implementação só começa em issue marcada `[PRONTA]`.**

Não atribua a agente comum:

- `#182` — painel geral do programa;
- `#184` a `#192` — acompanhamento das fases;
- `#220` — Saúde e limites, ainda planejada;
- `#264` — integração da nona onda.

As integrações `#203`, `#210`, `#214`, `#221`, `#229`, `#237`, `#246` e `#256` já foram concluídas.

## Onda 8 — concluída e integrada

| Issue | Entrega | PR/merge |
|---:|---|---|
| `#245` | Escrita e promoção transacional D1 local | `#258` / `d254e94` |
| `#254` | Regressões de isolamento restauradas | `#259` / `f18ccc7` |
| `#255` | Resultado anual e elegibilidade básica | `#260` / `ee0518c` |

As três entregas respeitaram caminhos exclusivos. A #245 foi integrada antecipadamente e revalidada no fechamento da onda; #254 e #255 foram revisadas nos SHAs finais antes dos merges pequenos.

Código funcional vigente da onda: `ee0518c98682665c4ee8f32a639abbd893872f40`. Deploy: `33491736646`.

## Onda 9 — executar agora, simultaneamente

| Agente | Issue | Trabalho |
|---|---:|---|
| 1 | `#261` | Runtime D1 local/preview, runner e backend autorizado |
| 2 | `#262` | Contexto acadêmico global e perfil 2026 |
| 3 | `#263` | Equivalência anual fonte × motor |

As três issues escrevem em áreas diferentes. A integração será feita exclusivamente pela `#264`.

## O que cada tarefa libera

```text
#261 → runtime autorizado sem produção silenciosa
#262 → ano/perfil único para os próximos fluxos
#263 → comparação auditável preservando imported-source
```

## Estado real do D1

Já existem migrations 0001–0003, 21 tabelas, leitura e escrita locais, compare-and-set, savepoints e promoção física fonte → registro → associação com rollback integral. Ainda não existem banco/binding remoto, migration aplicada em ambiente, runner/runtime autorizado ou persistência no site.

A `#261` prepara somente runtime local/preview e autorização; não autoriza provisionamento ou migration de produção.

## Gates manuais que não bloqueiam a onda 9

- Executar `REAL_DATA_VALIDATION.md` com o corpus real em ambiente privado antes de fechar definitivamente a F1.
- O happy path visual do manifesto foi aprovado com dois arquivos XLSB. Ainda faltam expandir o SHA-256, observar a etapa transitória de hash e conferir uma falha isolada.

Nunca publicar arquivos, nomes, notas, hashes ou caminhos privados.

## Fluxo visual

```text
CONCLUÍDO
#245 + #254 + #255 ──> integração #256

AGORA
#261 ─┐
#262 ─┼──> integração #264 ──> décima onda
#263 ─┘
```

## Instrução simples para iniciar

1. Escolha `#261`, `#262` ou `#263`.
2. Entregue somente essa issue ao agente.
3. O agente lê `AGENTS.md`, `docs/gradebook/` e a própria issue.
4. Executa diretamente, sem App Factory ou agentes auxiliares.
5. Cria branch curta e PR, executa `npm run verify` e registra o handoff.
6. Não faz merge, deploy, provisionamento nem altera `PROJECT_STATE.yaml`.
7. Depois das três entregas, execute a integração pela `#264`.
