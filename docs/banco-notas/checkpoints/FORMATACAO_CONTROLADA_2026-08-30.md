# Banco de Notas — formatação controlada

Data: 30/08/2026

Status: código e D1 preparados como base limpa; publicação depende de PR, CI e deploy canônico.

## Escopo executado

- Acompanhamento, Pesquisa e Pendências removidos da navegação, rotas, API, contratos específicos, repositórios e testes ativos.
- Visão geral e Configurações mantidas somente como páginas vazias, sem cards, formulários, configuração de fonte ou comandos.
- Código anterior preservado no ZIP de `docs/banco-notas/códigos de testes/`.
- Dados de planilhas piloto, alunos, turma, componente, professor, assignments, modelos, mappings, fontes, eventos e snapshots removidos do D1 de produção.
- Estrutura D1, migrations, configuração de segurança e gatilhos append-only preservados.
- SharePoint/Graph, Entra e add-in não sofreram mutação.

## Git

- branch de trabalho: `refactor/banco-notas-clean-slate`;
- baseline sincronizado de `main`: `fc24abea43d22bd4a1e3be0a8a6bccbc05cc9cfb`;
- alterações ainda não devem ser tratadas como publicadas até PASS do CI e deploy da `main`.

## Backup e reversibilidade

- export D1 anterior à limpeza: `C:\Users\Eugui\Documents\Codex\2026-08-30\banco-notas-formatacao-backup\banco-notas-production-pre-formatacao-2026-08-30.sql`;
- SHA-256 do export: `82D6516904CBF90D174ED53FF46CBC2FDC3A0DF4413CF3EFD07C5C9443E5AE88`;
- SQL executado: `C:\Users\Eugui\Documents\Codex\2026-08-30\banco-notas-formatacao-backup\limpeza-pilotos-2026-08-30.sql`;
- SHA-256 do SQL: `ED09A28C975D23A9E024F192548C1ADEE61C24BF65030F1C526EF9CFEEDD22B8`;
- archive de código: `docs/banco-notas/códigos de testes/codigo-banco-notas-pre-formatacao-2026-08-30.zip`;
- SHA-256 do archive: `60C4556D793C690F3CF7254E94D97F260E21D0DEBD0E64F817B8ECD2A39CD80F`.

## Evidência D1 live após a limpeza

- database: `banco-notas-production` (`e59579db-aa8b-4589-a02e-643cb4277b5f`);
- lote Cloudflare: 34 queries, 579 linhas escritas, sucesso;
- todas as 28 tabelas de negócio verificadas com contagem zero;
- `sync_configuration.id=global` preservado;
- `sync_enabled=0` e `commit_route_enabled=0`;
- gatilhos `grade_events_append_only_delete` e `audit_events_append_only_delete` recriados e confirmados.

## Regra de retomada

Antes de qualquer nova implementação ou publicação, revalidar branch/SHA, CI, deployment Pages, D1 e kill switches ao vivo. Não restaurar o ZIP para o runtime em bloco; consultar e reaproveitar apenas trechos conscientemente.
