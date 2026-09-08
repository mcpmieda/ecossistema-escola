# Banco de Notas — ponto de entrada

Este diretório é a memória oficial do Banco de Notas. Para execução, prevalecem `AGENTS.md`, `DECISIONS.md`, `PROJECT_STATE.yaml`, a issue executável atual e a coordenação #593.

## Comece por aqui

- [`COMECE_AQUI.md`](COMECE_AQUI.md) — fila curta e próxima ação;
- [Issue principal #182](https://github.com/mcpmieda/ecossistema-escola/issues/182) — acompanhamento do programa;
- [`ISSUE_MAP.md`](ISSUE_MAP.md) — trilha ativa e dependências;
- [`PROJECT_STATE.yaml`](PROJECT_STATE.yaml) — estado canônico legível por máquina;
- [`ROADMAP.md`](ROADMAP.md) — fases funcionais e implantação em 5 etapas;
- [`PRODUCTION_READINESS.md`](PRODUCTION_READINESS.md) — gates de produção, rollback e piloto.

## Estado atual — implantação na Etapa 3/5

O Banco já possui importação, domínio acadêmico, motor comparativo, Auditoria, centrais, Desempenho, Conselho, Boletins, PDF e Relatórios. A implantação institucional ainda não terminou.

A decisão BN-DEC-021 substituiu BN-DEC-016 quanto ao armazenamento físico principal futuro: **PostgreSQL/Supabase via Hyperdrive `PROD_DB`** é o storage-alvo. D1 continua canônico até o cutover explícito e será preservado como rollback por uma janela controlada.

O schema produtivo PostgreSQL `gradebook` já foi criado e aplicado sem dados reais, com 29 tabelas, 73 índices, 54 foreign keys e 6 migrations lógicas. O legado técnico D1 permanece preservado na pasta raiz [`Aprendizados/`](../../Aprendizados/).

## Trilha ativa

### Etapa 3/5 — em andamento

`#592 adapters PostgreSQL + dual verification → #594 backfill privado + paridade → #595 cutover + rollback D1 → #406 piloto integral da escola inteira`

O piloto #406 está pausado até o cutover para evitar validar duas vezes o mesmo corpus em storages diferentes.

### Etapa 4/5 — bloqueada

`#347` — ativação de `native-engine` por escopo, somente depois da Etapa 3/5 verde.

### Etapa 5/5 — bloqueada

`#596` — entrega institucional, runbook final, observabilidade, backup/restore e fechamento deliberado da janela de rollback.

## Invariantes ativos

- `authorityMode: imported-source` durante toda a Etapa 3/5;
- D1 continua oficial até #595;
- PostgreSQL é target/shadow até paridade e cutover;
- arquivos reais permanecem privados e fora de Git/CI;
- CAS, idempotência, histórico append-only e rollback permanecem obrigatórios;
- mudança de storage não ativa autoridade nativa;
- `native-engine` continua inativo até #347.

## Readiness histórico

O V1 permanece memória histórica de `prepared-for-manual-authorization`. O V2 histórico permanece `production-infrastructure-smoke-validated-awaiting-private-pilot`; esses estados documentam a preparação D1 anterior e não substituem a trilha atual de migração PostgreSQL.

## Processo oficial

```text
uma issue → uma branch curta → um PR → npm run verify → CI → merge/deploy quando autorizado → evidência sanitizada
```

Não usar App Factory, Factory Runs, orquestradores ou agentes auxiliares salvo autorização explícita. Nunca publicar dados reais de estudantes/professores, payloads acadêmicos, hashes privados ou credenciais.