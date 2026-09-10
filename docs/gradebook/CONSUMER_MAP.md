# Mapa dos consumidores — FINAL-1

## Escopo e estado integrado

A inspeção inicial em `0a05606a...` foi consolidada na #636, integrada em `4d8256fa6f741f4fb0b6ade8676d0f9193b7a460` e publicada no deploy 254 aprovado. A #640 integrou contexto/pesquisa/Centrais V2 em `6683d1377f2dd090c1346f693a4af4c2e188d7ae`, deploy 255 / `34477526551` aprovado. **Este mapa não é smoke HTTP autenticado de produção nem afirma falha observada em uma tela.** Testes HTTP usam identidades sintéticas e SQL descartável; dependência de relações antigas é incompatibilidade estrutural, não uma observação visual de produção.

Prefixos: HTTP em `server/gradebook/http/`, aplicação em `server/gradebook/application/`, provider em `server/gradebook/persistence/postgres/`; runtime antigo em `server/gradebook/persistence/d1/runtime/d1-runtime-v1.ts`.

| Consumidor / rota | Cadeia e dados | Estado / próximo bloco |
| --- | --- | --- |
| Importação — POST `/api/gradebook/import-persistence` | Function → provider → serviço V11 → catálogos/vínculos/instrumentos/notas/fechamentos/históricos | homologado #613; #636 removeu limpeza paralela de diagnósticos; V9/V10/V11 preservados |
| Auditoria de arquivos — GET/POST `/api/gradebook/import-diagnostics` | Function → provider → `replaceGradebookImportDiagnosticsSnapshotV1` / consulta paginada | retenção #629; substituição transacional #636 integrada/publicada, ainda sem smoke autenticado desta sessão |
| Contexto/pesquisa/Centrais — POST `/api/gradebook/operational-workspace`, V2 | shell → página/hook/client V2 → handler → `createRelationalWorkspaceV2` → `ano_letivo`, `aluno`, `vinculo`, `turma`, `professor`, `disciplina`, `oferta` | contrato #639, PR #640 integrada e deploy 255 aprovado; consulta read-only, contexto consistente por requisição e páginas; aceite autenticado/visual pendente |
| Operações e consumidores V1 no mesmo endpoint | dispatch V1 → runtime antigo → entidades/anos versionados e manutenção docente | preservados, sem converter automaticamente IDs; manutenção docente não é montada pela nova central V2; gestão de anos/escritas aguardam bloco próprio |
| Auditoria antiga — POST `/api/gradebook/audit-workspace` | handler → workspaces de auditoria/correção → importações/records antigos | não equivale à Auditoria atual de arquivos; decidir o necessário e adaptar/arquivar com teste |
| Desempenho — POST `/api/gradebook/performance` | handler → runtime → fonte D1 V1 → read model | #633/#634: fonte/contrato relacional e comparabilidade; Centrais V2 não fornecem notas/resultados |
| Boletins — POST `/api/gradebook/bulletins` | handler → materialização/emissão → read models e snapshots antigos | fontes atuais e durabilidade mínima contratada; reimpressão usa histórico, não cálculo atual |
| Relatórios — POST `/api/gradebook/reports` | handler → serviço → fontes operacionais/resultados/Boletins/Conselho/Auditoria | adaptar famílias suportadas explicitamente; V2 não elimina dependências V1 do serviço antigo |
| Conselho — POST `/api/gradebook/council-workspace` | catch-all → runtime → fonte oficial D1 → workspaces/stores V1/V2 | #633/#635: fonte relacional, voto/fechamento/histórico mínimos; contrato antes de ampliar schema |
| Administração D1 | `handleGradebookD1AdminRequestV1` antes do wrapper do provider | não administra o schema simplificado; não executar migrations antigas no PostgreSQL |
| Projeção oferta/aluno | `results/relational-academic-projection-v1.ts` → motor simplificado | lote até 1.000 pares em uma instrução; sem ligação a novo transporte de resultados |
| Projeção anual por aluno | `results/relational-student-annual-projection-v1.ts` → lote → motor anual | três leituras padrão; não é ainda uma matriz de turma nem aceite de emissão |

## Compatibilidade não é recriação

O provider injeta um facade PostgreSQL em `GRADEBOOK_D1`. Ele adapta interface/SQL, não recria streams/versions sobre as 20 tabelas atuais. Tipos read/write e autorização `d1-*` ainda são dependências necessárias. Remoção segue grafo/testes, não busca textual. V2 reutiliza a fronteira HTTP e autorização, mas não instancia o runtime de entidades antigas.

## Lacunas abertas

Identidade anual e consultas cadastrais ficam representadas no contrato #639; estado/lifecycle de ano não é inventado. Migração de consumidores V1 e unificação do contexto anual entre painéis continuam pendentes.

AM/U, cálculo, cobertura, divergência e aceite são separados; #347 registra vigência por consumidor. Notas de aluno com situação terminal podem ser exibíveis mesmo sem resultado: isso será tratado nas projeções acadêmicas, não pela lista cadastral.

Votação, desempate, fechamento e snapshots não estão completos no schema; precisam de contrato/extensão mínima. Baseline estrutural tem replay/drift; restore de dados/identities/configuração externa continua pendente. Batch acadêmico por oferta não garante snapshot das três leituras anuais; a transação read-only da #640 vale apenas para contexto e Centrais V2. Diagnósticos #636 ainda requerem contenção multi-sessão real e smoke autenticado, apesar dos testes de rollback.

## Próximo bloco

Migrar consumidores acadêmicos de resultados/Desempenho, manutenção/gestão de anos pelos contratos pertinentes → Boletins/Relatórios/durabilidade → Conselho → dependências mortas e piloto integral. Não reabrir migração física nem criar base paralela. A integração/publicação de entregas concluídas está autorizada continuamente pela BN-DEC-023, mantendo os gates.

Referências: [RELATIONAL_CENTERS_V2.md](RELATIONAL_CENTERS_V2.md), [CURRENT_SCHEMA_AND_DIAGNOSTICS.md](CURRENT_SCHEMA_AND_DIAGNOSTICS.md), [remediação #637](SECURITY_REMEDIATION_637.md). #640 publicou a nova interface de consulta sem alterar dados/schema, regras, credenciais, flags ou autoridade acadêmica; publicação e homologação continuam distintas.
