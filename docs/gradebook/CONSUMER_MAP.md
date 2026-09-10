# Mapa dos consumidores — FINAL-1

## Escopo da inspeção

Inspeção estática de composição/código na baseline `0a05606aa790bb3a4908308ec865e03438401b0a`, somada ao catálogo relacional observado na retomada. A PR #636 somente adiciona lote às projeções internas e documentação. **Este mapa não é smoke HTTP autenticado nem afirma falha observada em uma tela.** Relação antiga referenciada indica incompatibilidade estrutural a resolver antes de homologar o consumidor.

Prefixos dos caminhos abaixo: HTTP em `server/gradebook/http/`; runtime antigo em `server/gradebook/persistence/d1/runtime/d1-runtime-v1.ts`; aplicação em `server/gradebook/application/`; provider em `server/gradebook/persistence/postgres/`.

## Rotas, dependências e próximos blocos

| Consumidor / rota | Cadeia observada | Dados/modelo | Situação e próximo bloco |
| --- | --- | --- | --- |
| Importação — POST `/api/gradebook/import-persistence` | Function dedicada → `withOfficialGradebookDatabaseV1` → `createGradebookRelationalImportServiceV11` | catálogos, vínculos, instrumentos, notas, fechamento, importação e históricos relacionais | integrado/homologado #613; preservar V9/V10/V11 |
| Auditoria de arquivos — GET/POST `/api/gradebook/import-diagnostics` | Function dedicada → provider → SQL local do handler | `importacao_diagnostico`, `turma`, `vinculo`, `aluno` | integrado/homologado #629; somente problemas atuais; reforçar atomicidade/falhas sem mudar retenção |
| Contexto/centrais/pesquisa/manutenção docente — POST `/api/gradebook/operational-workspace` | catch-all → `handleOperationalWorkspaceRequestV1` → runtime → UoW/read models/catálogo de ano | modelo de entidades/anos versionados anterior | #633: catálogo/contexto relacional e contrato de IDs/paginação; não inventar dados para V1 |
| Auditoria antiga — POST `/api/gradebook/audit-workspace` | catch-all → `handleAuditWorkspaceRequestV1` → `auditWorkspace`/`deterministicCorrectionWorkspace` | fontes de auditoria/importação/records da geração streams/versions; corretor tem store local | não equivale à Auditoria atual de arquivos; decidir o que ainda é necessário e adaptar/arquivar com teste |
| Desempenho — POST `/api/gradebook/performance` | `handlePerformanceRequestV1` → runtime → `createGradebookD1ClassPerformanceSourceV1` → `createClassPerformanceReadModelV1` | entidades/records antigos e perfil V1; configuração comparativa vem da plataforma | #633/#634: fonte relacional/contrato compacto; preservar comparabilidade e autorização adicional `platform.settings.read` enquanto o contrato exigir |
| Boletins — POST `/api/gradebook/bulletins` | `handleBulletinRequestV1` → serviço/materialização/emissão → read models e `bulletinSnapshotRepository` | records/read models e snapshots streams/versions antigos | #633: fontes atuais e durabilidade mínima contratada; não trocar reimpressão histórica por cálculo atual |
| Relatórios — POST `/api/gradebook/reports` | `handleInstitutionalReportsRequestV1` → serviço de relatórios → read models/resultados/snapshots | dependências herdadas das fontes operacionais/Boletins/Conselho/Auditoria | #633: adaptar famílias suportadas com cobertura explícita; não criar indicadores sem contrato |
| Conselho — POST `/api/gradebook/council-workspace` | composição do catch-all → runtime → fonte oficial D1 → workspaces V1/V2 e stores duráveis | projeções antigas; decisões e sessões streams/versions | #633/#635: fonte relacional, voto/fechamento/histórico mínimos; contrato antes de ampliar persistência |
| Administração D1 | catch-all chama `handleGradebookD1AdminRequestV1` **antes** do wrapper de provider | binding D1 preservado | não é administração do schema simplificado; não executar migrations antigas no PostgreSQL nem remover a rota sem decisão própria |
| Projeção relacional oferta/aluno | `application/results/relational-academic-projection-v1.ts` → núcleo simplificado | `oferta`, `ano_letivo`, `vinculo`, `instrumento`, `nota`, `fechamento` | aplicação interna; `projectMany` da PR #636: uma instrução para lote limitado; sem nova ligação HTTP |
| Projeção anual por aluno | `application/results/relational-student-annual-projection-v1.ts` → lote → núcleo anual | turma corrente, catálogos e decisão formal | três consultas no caminho padrão; não é ainda uma matriz de turma nem aceite de emissão |

## O que o facade faz — e o que não faz

`official-gradebook-database-v1.ts` seleciona `GRADEBOOK_STORAGE_PROVIDER` e injeta o facade PostgreSQL em `GRADEBOOK_D1`. `postgres-database-v1.ts` adapta a interface e SQL; não materializa o modelo antigo sobre as 20 tabelas. Tipos read/write D1 ainda são dependências necessárias do importador e das projeções, apesar da conexão PostgreSQL.

A autorização opaca `authorizeGradebookD1RuntimeV1` também continua compartilhada. Renomear ou remover tudo que contenha D1 quebraria funções atuais. A remoção deve seguir grafo de dependências e testes, nunca busca textual isolada.

## Contratos/lacunas que bloqueiam a adaptação final

1. **Identidade/contexto:** V1 espera entidades e ano/configuração versionados. O modelo atual usa chaves relacionais e pessoa anual. Não fabricar matrícula interanual, versão ou data de situação ausentes.
2. **Resultado/autoridade:** projeções simplificadas não são o transporte V1. `AM/U` de fonte, cálculo, cobertura, divergência e aceite precisam permanecer separados. A #347 registra vigência por consumidor/escopo.
3. **Durabilidade institucional:** as tabelas centrais não possuem todos os campos de votação/desempate/fechamento nem snapshots de emissão. Propor somente extensão mínima justificada. Código de snapshot antigo não prova persistência no banco novo.
4. **População/visualização:** aluno sem resultado por situação pode ainda ter notas exibíveis. `components: []` no serviço anual terminal não resolve a visualização exigida por Desempenho/Boletim.
5. **Consistência e segurança:** batch elimina SQL por oferta, não elimina automaticamente SQL por aluno nem garante snapshot das três leituras anuais. Diagnóstico atual usa substituição de conjunto; concorrência/falha entre DELETE e INSERT ainda requer teste e atomicidade. Confirmar limites/auth/gates/logs de cada handler.
6. **Baseline de recuperação:** a reconstrução produtiva não tem nesta entrega uma baseline completa de schema+ajustes+privilégios testada em Git. Fixtures PGlite dos testes de projeção são deliberadamente parciais e sintéticas.

## Sequência concreta depois da PR #636

Fechar baseline e contrato de leitura/contexto → integrar contexto/catálogos/centrais com testes HTTP → integrar resultados/Desempenho → Boletins/Relatórios e durabilidade → Conselho conforme contrato → varrer dependências mortas e validar todas as jornadas. Cada bloco mantém regressões do importador/Auditoria. A fase não fecha por reduzir o número de nomes D1.

## Limites desta entrega

Nenhum endpoint, contrato compartilhado, regra acadêmica, schema, dado, secret, binding ou flag produtiva foi alterado. Nenhum recurso D1 foi apagado. Testes de código e planejamento não equivalem a liberação ou homologação integral.
