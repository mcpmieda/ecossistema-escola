# Mapa dos consumidores — FINAL-1

## Escopo e evidência

Inspeção inicial em `0a05606a...`, consolidada na #636; Centrais V2 integradas pela #640; segurança pela #641. A #642/#643 acrescenta leitura acadêmica e matriz V2. **Este mapa não é smoke HTTP autenticado de produção nem afirma homologação visual.** Testes SQL/HTTP usam dados e sessões sintéticos. O checkpoint de integração/publicação de cada entrega fica na respectiva issue/PR.

Prefixos: HTTP em `server/gradebook/http/`; aplicação em `server/gradebook/application/`; provider em `server/gradebook/persistence/postgres/`; runtime antigo em `server/gradebook/persistence/d1/runtime/d1-runtime-v1.ts`.

| Consumidor / rota | Cadeia e fonte | Estado / próximo bloco |
| --- | --- | --- |
| Importação — POST `/api/gradebook/import-persistence` | Function → provider → serviço V11 → catálogos/vínculos/instrumentos/notas/fechamentos/históricos | homologado #613; V9/V10/V11 preservados |
| Auditoria de arquivos — GET/POST `/api/gradebook/import-diagnostics` | Function → provider → substituição transacional/consulta de diagnósticos | retenção #629; atomicidade #636; smoke autenticado e contenção real continuam próprios |
| Contexto/pesquisa/Centrais — POST `/api/gradebook/operational-workspace`, V2 | shell → página/hook/client → handler → `createRelationalWorkspaceV2` → tabelas atuais | #640 integrada; #643 compartilha ano com Desempenho e normaliza booleano de Conselho pelo facade |
| Operações V1 no mesmo endpoint | runtime antigo → entidades/anos versionados e manutenção docente | preservadas, não montadas como manutenção na central V2; gestão de anos e escritas exigem adaptação |
| Auditoria antiga — POST `/api/gradebook/audit-workspace` | handler → workspaces/correção → importações/records antigos | não equivale à Auditoria atual de arquivos; adaptar somente o necessário ou arquivar com teste |
| Desempenho — POST `/api/gradebook/performance`, V2 | shell → `relational-performance-page-v2` → cliente → dispatch V2 → `createRelationalPerformanceV2` → `projectPerformanceFactsV2` → motor simplificado | #642/#643: matriz e detalhes calculados em validação, não emissão oficial; lentes/comparabilidade/gráficos completos #634 |
| Desempenho V1 no mesmo endpoint | runtime antigo → fonte D1 V1 → read model | compatibilidade legada preservada; não alimenta a nova página V2 e não é fallback do V2 |
| Boletins — POST `/api/gradebook/bulletins` | materialização/emissão → fontes e snapshots antigos | reancorar fontes e contratar durabilidade mínima; reimpressão não recalcula documento antigo |
| Relatórios — POST `/api/gradebook/reports` | fontes operacionais/resultados/Boletins/Conselho/Auditoria | adaptar famílias suportadas; contratos novos não eliminam dependências antigas automaticamente |
| Conselho — POST `/api/gradebook/council-workspace` | fonte oficial D1 → workspaces/stores V1/V2 | #635: fonte relacional, voto/fechamento/histórico mínimos; contrato antes de ampliar schema |
| Administração D1 | `handleGradebookD1AdminRequestV1`, antes do wrapper do provider | não administra schema simplificado; não executar migrations antigas no PostgreSQL |
| Projeção oferta/aluno | `results/relational-academic-projection-v1.ts` → motor simplificado | lote até 1.000 pares; serviço anterior não é o transporte V2 |
| Projeção anual individual | `results/relational-student-annual-projection-v1.ts` → lote → motor anual | três leituras padrão; isoladamente não é ainda uma matriz de turma nem aceite de emissão |

## Caminho acadêmico atual

V2 consulta `ano_letivo`, `turma`, `vinculo`, `aluno`, `oferta`, `disciplina`, `professor`, `instrumento`, `nota`, `fechamento` e `conselho_decisao`. Toda resposta usa transação read-only/repeatable-read. Matriz/detalhes fazem até seis instruções incluindo SET, sem N+1; catálogo três. Limite de 1.000 pares é explícito, não truncamento.

`GradebookYearProvider` compartilha ano/epoch entre Centrais e Desempenho. Troca de ano limpa os consumidores V2; demais áreas ainda têm integração própria. `readAt` identifica a hora da leitura, não uma versão permanente da fonte. AM/U, cobertura, cálculo, referência e decisão humana são separados; #347 registra aceite de autoridade. Notas de situação terminal continuam exibíveis quando existem, sem promover essas linhas à população de indicadores.

## Compatibilidade e lacunas

O provider injeta facade PostgreSQL em `GRADEBOOK_D1`: adapta interface, não recria streams/versions. Tipos e autorização chamados D1 ainda são necessários. Remoção deve seguir composição/SQL/testes, não busca por nome.

Votação, desempate, fechamento e snapshots não estão completos no schema. Baseline estrutural tem replay/drift; restore de dados/identities/configuração externa continua pendente. O snapshot V2 vale por resposta; não altera retroativamente os serviços anuais e de emissão anteriores. Diagnósticos #636 ainda requerem contenção multi-sessão real e smoke autenticado.

Próximo bloco: concluir lentes/comparabilidade/investigação #634, depois manutenção/gestão de anos, Boletins/Relatórios/durabilidade e Conselho pelos contratos pertinentes; piloto integral #406 e aceite #347 próprios. Não reabrir a migração física nem criar base paralela. Integração/deploy seguem BN-DEC-023.

Referências: [Centrais V2](RELATIONAL_CENTERS_V2.md), [Desempenho V2](RELATIONAL_PERFORMANCE_V2.md), [baseline/Auditoria](CURRENT_SCHEMA_AND_DIAGNOSTICS.md), [segurança](SECURITY_REMEDIATION_637.md).
