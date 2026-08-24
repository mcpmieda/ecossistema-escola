# Contrato de automações

O schema executável está em `server/automations/contracts.ts`. A definição exige UUID, versão semver, versão da allowlist, estado `enabled`, `dryRun`, gatilho, condições limitadas, ações limitadas e chave de idempotência.

Gatilhos permitidos: manual, schedule declarativo, evento de item e condição. Ações permitidas na versão 1: auditoria, e-mail com template `credential-expiry` para o grupo Secretaria e criação apenas nas listas técnicas de auditoria/execuções. Não existe `eval`, script, URL arbitrária ou nome livre de lista.

As listas `PLATAFORMA_AUTOMACOES` e `PLATAFORMA_EXECUCOES_AUTOMACAO` estão prontas, mas vazias de automações reais. Nenhum Cron, Workflow Cloudflare, fila ou scheduler compartilhado foi criado. Quando houver uma finalidade aprovada, um único scheduler compartilhado poderá ler definições ativas, validar o contrato, aplicar idempotência, executar somente a allowlist e gravar correlação e resultado.
