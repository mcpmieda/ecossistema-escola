# Banco de Notas — ponto de entrada

Este diretório é a memória oficial do Banco de Notas. Para execução, prevalecem `AGENTS.md`, as decisões/documentos canônicos, a issue atual e os handoffs mais recentes.

## Comece por aqui

- [`COMECE_AQUI.md`](COMECE_AQUI.md) — fila executável atual;
- [Issue principal #182](https://github.com/mcpmieda/ecossistema-escola/issues/182) — acompanhamento humano;
- [`ISSUE_MAP.md`](ISSUE_MAP.md) — fases, ondas e dependências;
- [`PROJECT_STATE.yaml`](PROJECT_STATE.yaml) — estado legível por máquina;
- [`PRODUCTION_READINESS.md`](PRODUCTION_READINESS.md) — gates, ensaios e protocolo F9;
- [Issue #374](https://github.com/mcpmieda/ecossistema-escola/issues/374) — integração da onda 22.

## Estado atual — onda 22

A onda 22 integrou a decisão institucional, os contratos e as duas fundações operacionais:

- #349 / PR #375 — BN-DEC-019 consolidada, sem ativar produção ou autoridade;
- #371 / PR #376 — contratos V2 de comparação proporcional e reconciliação determinística;
- #372 / PR #377 — comparação profile-aware no bridge existente de Desempenho;
- #373 / PR #378 — investigação/correção determinística no Audit Workspace existente;
- #374 / PR #379 — regressão transversal, memória canônica e publicação da composição.

A F1 7/7 e a fidelidade prospectiva da onda 21 permanecem intactas. O resultado máximo de readiness continua **`prepared-for-manual-authorization`**.

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
- **F6:** concluída; gráficos oficiais e comparação proporcional profile-aware integrados, com configuração server-side e write administrativo ainda em hard stop;
- **F7/F8:** Conselho V2, decisões/snapshots duráveis, PDF e Relatórios integrados em local/preview;
- **F9:** preparação de readiness concluída; piloto, produção e mudança de autoridade não autorizados.

## Próximo gate

Não há ativação automática após a onda 22. A ordem recomendada é:

`onda 22 concluída → onda 23 produção controlada → onda 24 piloto real → #347 autoridade nativa`

A onda 23 deve usar issues próprias e gates independentes para recurso/binding, migration remota e smoke acadêmico produtivo. Piloto real e mudança de autoridade continuam proibidos até suas etapas posteriores.

## Processo oficial

```text
uma issue → uma branch curta → um PR → npm run verify → handoff
frentes verdes → integração própria → main → deploy/smokes públicos sem dados → gate manual
```

Não usar App Factory, Factory Runs, orquestradores ou agentes auxiliares salvo autorização explícita da issue. O repositório é público: nunca publicar dados reais de estudantes em fixtures, logs, issues, PRs ou commits.
