# Retirada seletiva da superfície Audit Workspace V1 — #664

## Base e prova de dependência

A entrega parte de `main@89cb382d588364560ac250a4a1f0e0d65a079573`, depois da integração da #662/PR #663 e do deploy 267. A inspeção foi feita por símbolos, imports, rotas, composição do shell e testes; nomes contendo `D1`, `audit` ou `V1` não foram tratados como prova de obsolescência.

`GradebookAuditSurface` monta exclusivamente `RelationalCurrentAuditPageV2`. Os arquivos `audit-workspace-page.tsx`, `audit-workspace-client.ts` e `import-diagnostics-audit-panel-v1.tsx` não possuíam chamador de produção. O endpoint dedicado `POST /api/gradebook/audit-workspace` era alcançável somente pelo roteador genérico e não possuía cliente ativo. Esses quatro entrypoints foram retirados.

## O que permanece

A Auditoria Atual V2 continua consultando `GET /api/gradebook/import-diagnostics`, com ano fixo 2026, autorização e `no-store`. A escrita transacional do snapshot corrente de `gradebook.importacao_diagnostico` continua no fluxo de importação e não foi alterada.

O contrato `audit-workspace-contract-v1`, `createAuditWorkspaceV1`, o source D1 e a composição `runtime.auditWorkspace(...)` permanecem porque `institutional-reports-routes-v1.ts` ainda cria o serviço de Relatórios V1 com essa dependência. A correção determinística e os contratos históricos também ficam fora da remoção. Portanto, esta entrega não afirma que todo código V1/D1 está morto.

## Regressão e limites

O teste de aposentadoria exige a ausência física dos quatro entrypoints, a ausência do dispatch no roteador e a montagem exclusiva da página relacional. As regressões históricas foram atualizadas para verificar o limite corrente sem apagar as provas do núcleo ainda utilizado.

Não há DDL/DML, migration, acesso a dados, mudança de diagnóstico, regra acadêmica, autoridade, binding, segredo ou infraestrutura. A trilha durável futura de reconhecimento/justificativa/resolução da Auditoria continua dependente de contrato próprio. Recuperação operacional externa, piloto #406, aceite #347 e validação visual conjunta permanecem gates separados.
