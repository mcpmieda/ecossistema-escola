# Mapa dos consumidores — FINAL-1

## Escopo e evidência

Inspeção inicial em `0a05606a...`, consolidada na #636; Centrais V2 integradas pela #640; segurança pela #641; matriz/lentes relacionais pelas PRs #643/#645. A #646 coordena fonte, ano e composição desktop. **Este mapa não é smoke HTTP autenticado de produção nem afirma homologação visual.** Testes SQL/HTTP usam dados e sessões sintéticos. O checkpoint de integração/publicação de cada entrega fica na respectiva issue/PR.

Prefixos: HTTP em `server/gradebook/http/`; aplicação em `server/gradebook/application/`; provider em `server/gradebook/persistence/postgres/`; runtime antigo em `server/gradebook/persistence/d1/runtime/d1-runtime-v1.ts`.

| Consumidor / rota | Cadeia e fonte | Estado / próximo bloco |
| --- | --- | --- |
| Importação — POST `/api/gradebook/import-persistence` | Function → provider → serviço V11 → catálogos/vínculos/instrumentos/notas/fechamentos/históricos | homologado #613; V9/V10/V11 preservados |
| Auditoria de arquivos — GET/POST `/api/gradebook/import-diagnostics` | Function → provider → substituição transacional/consulta de diagnósticos | retenção #629; atomicidade #636; GET filtrado pelo ano global na #646; smoke autenticado e contenção real continuam próprios |
| Contexto/pesquisa/Centrais — POST `/api/gradebook/operational-workspace`, V2 | shell → página/hook/client → handler → `createRelationalWorkspaceV2` → tabelas atuais | #640 integrada; catálogo numérico governa o ano global a partir da #646 |
| Operações V1 no mesmo endpoint | runtime antigo → entidades/anos versionados e manutenção docente | preservadas, não montadas como manutenção na central V2; gestão de anos e escritas exigem adaptação |
| Auditoria antiga — POST `/api/gradebook/audit-workspace` | handler → workspaces/correção → importações/records antigos | não equivale à Auditoria atual de arquivos; #646 liga apenas o ID cujo rótulo corresponda exatamente ao ano global |
| Desempenho — POST `/api/gradebook/performance`, V2/V3 | shell → `relational-performance-page-v2` → cliente → dispatch → `createRelationalPerformanceV2` → `projectPerformanceFactsV2` → motor simplificado | matriz #643, lentes/investigação #645 e fonte/detalhe/desktop #646; comparação continua fechada sem perfil oficial |
| Desempenho V1 no mesmo endpoint | runtime antigo → fonte D1 V1 → read model | compatibilidade legada preservada; não alimenta a nova página V2 e não é fallback do V2 |
| Boletins — POST `/api/gradebook/bulletins` | materialização/emissão → fontes e snapshots antigos | ano coordenado por mapeamento exato na #646; reancorar fontes/durabilidade; reimpressão não recalcula documento antigo |
| Relatórios — POST `/api/gradebook/reports` | fontes operacionais/resultados/Boletins/Conselho/Auditoria | ano coordenado por mapeamento exato; contratos novos não eliminam dependências antigas automaticamente |
| Conselho — POST `/api/gradebook/council-workspace` | fonte oficial D1 → workspaces/stores V1/V2 | ano coordenado por mapeamento exato; #635 ainda contrata fonte relacional, voto/fechamento/histórico mínimos |
| Administração D1 | `handleGradebookD1AdminRequestV1`, antes do wrapper do provider | não administra schema simplificado; não executar migrations antigas no PostgreSQL |
| Projeção oferta/aluno | `results/relational-academic-projection-v1.ts` → motor simplificado | lote até 1.000 pares; serviço anterior não é o transporte V2 |
| Projeção anual individual | `results/relational-student-annual-projection-v1.ts` → lote → motor anual | três leituras padrão; isoladamente não é ainda uma matriz de turma nem aceite de emissão |

## Caminho acadêmico atual

V2 consulta `ano_letivo`, `turma`, `vinculo`, `aluno`, `oferta`, `disciplina`, `professor`, `instrumento`, `nota`, `fechamento` e `conselho_decisao`. Toda resposta usa transação read-only/repeatable-read. Matriz/detalhes fazem até seis instruções incluindo SET, sem N+1; catálogo três. Limite de 1.000 pares é explícito, não truncamento.

`GradebookYearProvider` compartilha ano/epoch entre Centrais, Auditoria, Desempenho, Boletins, Relatórios e Conselho; Importação não recebe esse seletor. Troca de ano remonta todos os consumidores visitados. Áreas V1 continuam com integração própria e só recebem correspondência única/exata de catálogo, sem reinterpretação do ano da fonte. `readAt` identifica a hora da leitura, não uma versão permanente da fonte. AM/U, cobertura, cálculo, referência e decisão humana são separados; #347 registra aceite de autoridade.

## Compatibilidade e lacunas

O provider injeta facade PostgreSQL em `GRADEBOOK_D1`: adapta interface, não recria streams/versions. Tipos e autorização chamados D1 ainda são necessários. Remoção deve seguir composição/SQL/testes, não busca por nome.

Votação, desempate, fechamento e snapshots não estão completos no schema. Baseline estrutural tem replay/drift; restore de dados/identities/configuração externa continua pendente. O snapshot V2 vale por resposta; não altera retroativamente os serviços anuais e de emissão anteriores. Diagnósticos #636 ainda requerem contenção multi-sessão real e smoke autenticado.

Próximo bloco: fechar a #646 pelos gates; comparabilidade/configurações sem semântica oficial e validação visual permanecem na #634. Depois, manutenção/gestão de anos, fontes relacionais de Boletins/Relatórios/Conselho e durabilidade seguem os contratos pertinentes; piloto #406 e aceite #347 são próprios. Não reabrir a migração física nem criar base paralela. Integração/deploy seguem BN-DEC-023.

Referências: [Centrais V2](RELATIONAL_CENTERS_V2.md), [Desempenho V2](RELATIONAL_PERFORMANCE_V2.md), [fonte/ano/desktop #646](FINAL2_SOURCE_DESKTOP_646.md), [baseline/Auditoria](CURRENT_SCHEMA_AND_DIAGNOSTICS.md), [segurança](SECURITY_REMEDIATION_637.md).
