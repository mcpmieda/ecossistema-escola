# Banco de Notas — ponto de entrada

Este diretório é a memória oficial do Banco de Notas. Para execução, prevalecem `AGENTS.md`, as decisões/documentos canônicos, a issue atual e os handoffs mais recentes.

## Comece por aqui

- [`COMECE_AQUI.md`](COMECE_AQUI.md) — fila executável atual;
- [Issue principal #182](https://github.com/mcpmieda/ecossistema-escola/issues/182) — acompanhamento humano;
- [`ISSUE_MAP.md`](ISSUE_MAP.md) — fases, ondas e dependências;
- [`PROJECT_STATE.yaml`](PROJECT_STATE.yaml) — estado legível por máquina;
- [`PRODUCTION_READINESS.md`](PRODUCTION_READINESS.md) — gates, ensaios e protocolo F9;
- [Issue #367](https://github.com/mcpmieda/ecossistema-escola/issues/367) — integração da onda 21.

## Estado atual — onda 21

A onda 21 corrige prospectivamente a fidelidade das definições trimestrais antes do piloto:

- #365 / PR #368 — `SourceContractV2` e `AssessmentComponentV2` para R/S e AA:AJ, preservando V1 histórico;
- #366 / PR #369 — reconhecimento, materialização, versionamento, D1 e consumidores ponta a ponta;
- #367 — regressão transversal, memória canônica e nova readiness sintética.

A F1 7/7 continua sendo evidência correta do contrato vigente à época. A onda 21 é manutenção prospectiva pós-validação, não reinterpretação retroativa. O resultado máximo de readiness continua **`prepared-for-manual-authorization`**.

## Invariantes ativos

- `authorityMode: imported-source`;
- produção acadêmica fail-closed antes de `GRADEBOOK_D1`;
- D1 acadêmico produtivo, binding, secret e migrations remotas ausentes;
- nenhum piloto real ou smoke acadêmico produtivo executado;
- somente dados sintéticos no repositório/CI;
- #347 e a eventual transição para `native-engine` permanecem separadas.

## Readiness F9

Os ensaios versionados cobrem lote sintético bounded, replay local das migrations 0001–0004, histórico durável de Boletins, fila/CAS de Conselho, rollback local e fail-closed produtivo. O catálogo de smoke é apenas dado declarativo: não possui cliente de rede nem executor de migration.

Cinco hard stops continuam obrigatórios e independentes:

1. autorização para recurso e binding produtivos;
2. autorização para migration remota;
3. autorização para smoke acadêmico produtivo;
4. autorização institucional para piloto privado real;
5. autorização/versionamento/vigência separados para autoridade nativa.

## Estado funcional

- **F1:** concluída e validada 7/7; fidelidade prospectiva V2 de avaliações integrada pela onda 21;
- **F2:** persistência e durabilidade completas em local/preview; produção desativada;
- **F3:** motor V1 comparativo; autoridade continua importada;
- **F4/F5:** concluídas;
- **F6:** gráficos oficiais entregues; comparação proporcional segue bloqueada sem semântica canônica;
- **F7/F8:** Conselho V2, decisões/snapshots duráveis, PDF e Relatórios integrados em local/preview;
- **F9:** preparação de readiness concluída; piloto, produção e mudança de autoridade não autorizados.

## Próximo gate

Não há ativação automática após a onda 21. O projeto retorna aos gates manuais F9. Qualquer provisionamento, binding, migration remota, smoke acadêmico produtivo ou piloto real exige issue/autorização própria. A #347 não pode ser antecipada e depende de autorização institucional separada.

## Processo oficial

```text
uma issue → uma branch curta → um PR → npm run verify → handoff
frentes verdes → integração própria → main → deploy/smokes públicos sem dados → gate manual
```

Não usar App Factory, Factory Runs, orquestradores ou agentes auxiliares salvo autorização explícita da issue. O repositório é público: nunca publicar dados reais de estudantes em fixtures, logs, issues, PRs ou commits.
