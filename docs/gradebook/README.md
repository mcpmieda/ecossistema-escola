# Banco de Notas — ponto de entrada

Este diretório é a memória oficial do Banco de Notas. Para execução, prevalecem `AGENTS.md`, as decisões/documentos canônicos, a issue atual e os handoffs mais recentes.

## Comece por aqui

- [`COMECE_AQUI.md`](COMECE_AQUI.md) — fila executável atual;
- [Issue principal #182](https://github.com/mcpmieda/ecossistema-escola/issues/182) — acompanhamento humano;
- [`ISSUE_MAP.md`](ISSUE_MAP.md) — fases, ondas e dependências;
- [`PROJECT_STATE.yaml`](PROJECT_STATE.yaml) — estado legível por máquina;
- [`PRODUCTION_READINESS.md`](PRODUCTION_READINESS.md) — gates, ensaios e protocolo F9;
- [Issue #361](https://github.com/mcpmieda/ecossistema-escola/issues/361) — integração da onda 20.

## Estado atual — onda 20

A onda 20 integra a preparação de readiness F9 sem ativar produção:

- #360 / PR #363 — manifesto puro de readiness, seis evidências preparatórias, cinco hard stops manuais, plano de smoke futuro e ensaios sintéticos;
- #361 — composição transversal, regressão de integração, memória canônica e publicação dos artefatos inertes.

O único resultado positivo da preparação é **`prepared-for-manual-authorization`**. Ele não significa `production-ready`, piloto aprovado, recurso provisionado ou autoridade alterada.

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

- **F1:** concluída e validada 7/7;
- **F2:** persistência e durabilidade completas em local/preview; produção desativada;
- **F3:** motor V1 comparativo; autoridade continua importada;
- **F4/F5:** concluídas;
- **F6:** gráficos oficiais entregues; comparação proporcional segue bloqueada sem semântica canônica;
- **F7/F8:** Conselho V2, decisões/snapshots duráveis, PDF e Relatórios integrados em local/preview;
- **F9:** preparação de readiness concluída; piloto, produção e mudança de autoridade não autorizados.

## Próximo gate

Não há ativação automática após esta publicação. Qualquer provisionamento, binding, migration remota, smoke acadêmico produtivo ou piloto real exige issue/autorização própria. A #347 não pode ser antecipada e depende de autorização institucional separada.

## Processo oficial

```text
uma issue → uma branch curta → um PR → npm run verify → handoff
frentes verdes → integração própria → main → deploy/smokes públicos sem dados → gate manual
```

Não usar App Factory, Factory Runs, orquestradores ou agentes auxiliares salvo autorização explícita da issue. O repositório é público: nunca publicar dados reais de estudantes em fixtures, logs, issues, PRs ou commits.
