# Mapa dos consumidores — FINAL-1

## Escopo da inspeção

Inspeção estática da baseline `0a05606aa790bb3a4908308ec865e03438401b0a`, somada ao catálogo relacional observado. A PR #636 reúne documentação, lote de projeções internas, baseline reproduzível e reforço da Auditoria atual. **Este mapa não é smoke HTTP autenticado de produção nem afirma falha observada em uma tela.** Os testes HTTP desta PR usam identidade sintética e SQL descartável. Relação antiga referenciada indica incompatibilidade estrutural a resolver antes de homologar o consumidor.

Prefixos: HTTP em `server/gradebook/http/`; runtime antigo em `server/gradebook/persistence/d1/runtime/d1-runtime-v1.ts`; aplicação em `server/gradebook/application/`; provider em `server/gradebook/persistence/postgres/`.

## Rotas, dependências e próximos blocos

| Consumidor / rota | Cadeia observada | Dados/modelo | Situação e próximo bloco |
| --- | --- | --- | --- |
| Importação — POST `/api/gradebook/import-persistence` | Function dedicada → `withOfficialGradebookDatabaseV1` → `createGradebookRelationalImportServiceV11` | catálogos, vínculos, instrumentos, notas, fechamento, importação e históricos relacionais | homologado #613; PR #636 retira somente a limpeza independente de diagnósticos; V9/V10/V11 preservados |
| Auditoria de arquivos — GET/POST `/api/gradebook/import-diagnostics` | Function dedicada → provider → serviço `replaceGradebookImportDiagnosticsSnapshotV1` para escrita / consulta paginada para leitura | `importacao_diagnostico`, `turma`, `vinculo`, `aluno` | retenção homologada #629; PR #636 implementa substituição atômica, rollback e vazio; falta publicação/smoke autorizado |
| Contexto/centrais/pesquisa/manutenção docente — POST `/api/gradebook/operational-workspace` | catch-all → `handleOperationalWorkspaceRequestV1` → runtime → UoW/read models/catálogo de ano | entidades/anos versionados anteriores | #633: catálogo/contexto relacional e contrato de IDs/paginação; não inventar dados para V1 |
| Auditoria antiga — POST `/api/gradebook/audit-workspace` | catch-all → `handleAuditWorkspaceRequestV1` → workspaces de auditoria/correção | fontes de auditoria/importação/records da geração streams/versions; corretor tem store local | não equivale à Auditoria atual de arquivos; decidir o necessário e adaptar/arquivar com teste |
| Desempenho — POST `/api/gradebook/performance` | handler → runtime → `createGradebookD1ClassPerformanceSourceV1` → read model | entidades/records antigos e perfil V1; configuração vem da plataforma | #633/#634: fonte/contrato relacional; preservar comparabilidade e autorização adicional enquanto o contrato exigir |
| Boletins — POST `/api/gradebook/bulletins` | handler → materialização/emissão → read models e snapshot repository | records/read models e snapshots streams/versions antigos | #633: fontes atuais e durabilidade mínima contratada; reimpressão usa histórico, não cálculo atual |
| Relatórios — POST `/api/gradebook/reports` | handler → serviço → read models/resultados/snapshots | dependências de fontes operacionais/Boletins/Conselho/Auditoria | #633: adaptar famílias suportadas com cobertura explícita |
| Conselho — POST `/api/gradebook/council-workspace` | catch-all → runtime → fonte oficial D1 → workspaces/stores V1/V2 | projeções, decisões e sessões anteriores | #633/#635: fonte relacional e voto/fechamento/histórico mínimos; contrato antes de ampliar persistência |
| Administração D1 | catch-all chama `handleGradebookD1AdminRequestV1` antes do wrapper de provider | binding D1 preservado | não administra o schema simplificado; não executar migrations antigas no PostgreSQL |
| Projeção relacional oferta/aluno | `application/results/relational-academic-projection-v1.ts` → núcleo simplificado | oferta, ano, vínculo, instrumento, nota, fechamento | aplicação interna; lote limitado a 1.000 pares em uma instrução, sem nova ligação HTTP |
| Projeção anual por aluno | `application/results/relational-student-annual-projection-v1.ts` → lote → núcleo anual | turma corrente, catálogos, decisão formal | três consultas padrão; não é ainda uma matriz de turma nem aceite de emissão |

## Compatibilidade não é recriação do modelo antigo

O provider seleciona `GRADEBOOK_STORAGE_PROVIDER` e injeta o facade PostgreSQL em `GRADEBOOK_D1`. O facade adapta interface/SQL, mas não materializa streams/versions sobre as 20 tabelas atuais. Tipos read/write e autorização `d1-*` continuam dependências necessárias; sua remoção deve seguir grafo e testes, nunca busca textual isolada.

## Lacunas que continuam abertas

1. **Identidade/contexto:** V1 espera entidades/ano/configuração versionados. O modelo atual usa chaves relacionais e pessoa anual. Não fabricar matrícula interanual, versão ou data ausentes.
2. **Resultado/autoridade:** projeção simplificada não é transporte V1. AM/U de fonte, cálculo, cobertura, divergência e aceite ficam separados; #347 registra vigência por consumidor/escopo.
3. **Durabilidade institucional:** votação/desempate/fechamento e snapshots de emissão não estão integralmente nas tabelas atuais. Extensão mínima exige contrato; código antigo não prova durabilidade atual.
4. **População/visualização:** aluno sem resultado por situação pode ter notas exibíveis. `components: []` do anual terminal não resolve a visualização de Desempenho/Boletim.
5. **Consistência:** batch por oferta não elimina automaticamente consultas por aluno nem unifica as três leituras anuais em um snapshot. A troca de diagnósticos agora é transacional na branch; falta contenção multi-sessão real e validação pós-deploy. A ordem é última observação confirmada no servidor, não detecção de versão cronológica entre abas.
6. **Recuperação:** baseline completa está em `migrations/gradebook-simplified/` e testes de replay/drift/constraints/grants. Restore dos dados, identities e configuração externa ainda não foi comprovado por esta PR.

## Próximo bloco

Contrato de leitura/contexto → integrar catálogos/centrais com testes HTTP → resultados/Desempenho → Boletins/Relatórios/durabilidade → Conselho → dependências mortas e jornadas integrais. Preservar as regressões do importador/Auditoria. Não reabrir migração de storage nem construir uma base paralela.

Detalhes da baseline e da atomicidade: [CURRENT_SCHEMA_AND_DIAGNOSTICS.md](CURRENT_SCHEMA_AND_DIAGNOSTICS.md). Nenhum endpoint novo, contrato compartilhado, regra acadêmica, dado/schema, secret, binding ou flag de produção foi alterado. Os handlers existentes têm mudanças na branch ainda não publicada; nenhum recurso D1 foi apagado.
