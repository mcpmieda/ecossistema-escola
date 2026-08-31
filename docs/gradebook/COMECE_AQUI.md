# Comece aqui — mapa curto para agentes

## Regra principal

**Agente de implementação só começa em issue marcada `[PRONTA]`.**

Não atribua a um agente comum:

- `#182` — painel geral do programa;
- `#184` a `#192` — acompanhamento das fases;
- `#220` — Saúde e limites, ainda planejada;
- `#237` — integração da sexta onda.

As integrações `#203`, `#210`, `#214`, `#221` e `#229` já foram concluídas.

## Ondas concluídas

| Onda | Issues | Integração |
|---:|---|---|
| 1 | `#193`, `#194`, `#195` | `#203` |
| 2 | `#196`, `#198` | `#210` |
| 3 | `#197`, `#201` | `#214` |
| 4 | `#199`, `#218`, `#219` | `#221` |
| 5 | `#226`, `#227`, `#228` | `#229` |

A quinta onda integrou a composição trimestral nativa, o schema/migrations D1 local e o planejador idempotente de reimportação. Código vigente da onda: `781a2a25640366f1807de7d98cf0157f5c3cfea1`; deploy: `33436989871`.

## Onda 6 — executar agora, simultaneamente

| Agente | Issue | Trabalho |
|---|---:|---|
| 1 | `#234` | Recuperação paralela nativa V1 |
| 2 | `#235` | Catálogo fonte lógica ↔ streams e adaptador D1 local de leitura |
| 3 | `#236` | Executor transacional do plano de reimportação |

As três issues escrevem em áreas diferentes e podem começar juntas. A integração será feita exclusivamente pela `#237`.

## Por que a #235 existe

A #228 precisa listar os registros acadêmicos atualmente ligados a uma fonte lógica para detectar o que desapareceu de uma nova versão. As migrations 0001–0002 ainda não guardam essa ligação em uma tabela própria.

A #235 adicionará essa relação de forma indexada e versionada. O agente não deve contornar a lacuna varrendo JSON nem usando o nome do arquivo como identidade.

## O que cada tarefa libera

```text
#234 → consolidação trimestral completa e próxima regra do motor
#235 → leitura persistente do planejamento e adaptador D1 completo
#236 → execução segura do plano contra portas transacionais

#235 + #236 → escrita/promoção transacional concreta no D1
```

## Gates manuais que não bloqueiam a onda 6

- Executar `REAL_DATA_VALIDATION.md` com o corpus real em ambiente privado antes de fechar definitivamente a F1.
- O happy path visual da #199 foi aprovado pelo operador com dois arquivos XLSB. Ainda faltam, para o smoke completo, expandir o SHA-256, observar a etapa transitória de hash e conferir um diagnóstico de falha isolada.

Nunca publicar arquivos, nomes, notas, hashes ou caminhos privados.

## Fluxo visual

```text
CONCLUÍDO
#193 + #194 + #195 ──> #203
#196 + #198 ──────────> #210
#197 + #201 ──────────> #214
#199 + #218 + #219 ───> #221
#226 + #227 + #228 ───> #229

AGORA
#234 ─┐
#235 ─┼──> integração #237 ──> sétima onda
#236 ─┘
```

## Instrução simples para iniciar

1. Escolha `#234`, `#235` ou `#236`.
2. Entregue somente essa issue ao agente.
3. O agente lê `AGENTS.md`, `docs/gradebook/` e a própria issue.
4. O agente executa diretamente, sem App Factory ou agentes auxiliares.
5. O agente cria branch e PR, executa `npm run verify` e registra o handoff.
6. O agente não faz merge, deploy, provisionamento nem altera `PROJECT_STATE.yaml`.
7. Depois das três entregas, execute a integração pela `#237`.
