# Arquitetura — estado relacional e consumidores em transição

Base integrada: `main@380b016d0c1ec5917323fe3fad35398b4fbd1a6a`; Conselho relacional #648/PR #653, Boletins V2 #654/PR #655, Relatórios V2 #656/PR #657 e Auditoria atual #658/PR #659 integrados e publicados. Configuração docente relacional está em execução pela #660. O [mapa por consumidor](CONSUMER_MAP.md) é parte deste documento.

## Caminho integrado de importação

```text
Relação + planilhas dos professores, lidas no navegador
  → reconhecimento e normalização para payload canônico V9
  → POST /api/gradebook/import-persistence
  → withOfficialGradebookDatabaseV1
  → Hyperdrive PROD_DB → PostgreSQL/Supabase
  → createGradebookRelationalImportServiceV11 (sobre V10/V9)
  → fatos relacionais + histórico somente de deltas reais
```

A Relação é mestre para nome/situação/vínculo. Notas referenciam instrumento/aluno; oferta é ano/turma/disciplina/professor. Valores em milésimos e `N/C` não são confundidos com vazio. `AM/U` permanecem referência independente; totais derivados pertencem ao motor. Arquivo original não é alterado.

A unidade acadêmica de escrita e idempotência foi homologada na #613. Atualização de diagnóstico operacional pode ocorrer mesmo em `no-changes`; isso não é DML acadêmico.

## Auditoria de importação atual

`GET/POST /api/gradebook/import-diagnostics` usa `gradebook.importacao_diagnostico` e resolve identificação do aluno por turma/vínculo/cadastro. A última observação de arquivo/ano substitui as ocorrências anteriores, conforme #629; resolvidos não formam histórico separado. A #658 monta somente a leitura desse estado corrente. O endpoint `/audit-workspace` antigo é outro consumidor, fica fora da superfície ativa e não é fallback nem histórico humano durável.

## Provedor não é modelo de dados

`withOfficialGradebookDatabaseV1` seleciona provider e, no caminho PostgreSQL, injeta um facade compatível em `GRADEBOOK_D1`. Isso permite que tipos ou nomes `D1ReadDatabaseV1`, `D1WriteDatabaseV1` e `d1-*` apareçam em código que executa em PostgreSQL.

O facade traduz sintaxe/parametrização; não reconstrói tabelas `academic_*_streams`, `*_versions`, snapshots ou sessões removidas. Consumidor que consulta essas relações não está migrado apenas porque recebe PostgreSQL. Não retirar o facade/portas ainda usados pelo importador.

O default do seletor físico ainda é `d1` quando a variável não é informada. Esta PR não altera a variável nem afirma que uma configuração ausente é aceitável em produção. O antigo admin D1 é roteado antes desse wrapper e precisa de tratamento separado.

## Projeções relacionais e motor

`relational-academic-projection-v1.ts` lê fatos e chama `resolve-simplified-academic-engine-v1.ts`. A projeção anual chama `resolve-simplified-annual-outcome-v1.ts`; nenhuma segunda fórmula é acrescentada na UI.

A leitura `projectMany` da PR #636 aceita até 1.000 pares únicos oferta/aluno, com parâmetros vinculados e **uma instrução SQL** para os fatos do lote. Preserva ordem solicitada e rejeita escopo ausente; não devolve zeros sintéticos. A projeção anual padrão usa três consultas: contexto, ofertas e lote. Isso elimina consultas por oferta nesse serviço, mas **não** prova ausência de N+1 de uma futura matriz de turma nem snapshot transacional das três consultas. Esses gates permanecem na #633.

A precedência de situações terminais continua no núcleo/serviço anual. O fato de não calcular resultado para ASSISTIDO não dispensa uma futura projeção de visualização das suas notas quando exigida pelo contrato de Desempenho/Boletim.

## Consumidores e reancoragem

O catch-all mantém operações V1 de leitura do Operational Workspace, Audit Workspace antigo, Boletins e Relatórios. As páginas ativas de Desempenho usam V2/V3/V4 relacional, Conselho usa V3 relacional, Boletins usa V2 relacional e Relatórios usa V2 relacional; os respectivos V1 permanecem compatibilidade não montada. A #658 faz o mesmo isolamento da página antiga de Auditoria. A #660 usa as ofertas importadas como configuração docente e recusa o write `maintenanceVersion` antes do runtime antigo; reativá-lo exigiria contrato/durabilidade novos. A #649 fixa 2026 e remove criação/seleção de anos. A #648 acrescentou oito tabelas de Conselho; a #654 acrescentou uma relação append-only de snapshots de boletim; #656, #658 e #660 não alteram schema. Ver `CONSUMER_MAP.md` antes de alterar qualquer consumidor.

Boletins materializa um ou mais alunos no mesmo snapshot read-only/repeatable-read, usando projeção oferta/aluno em lote e uma leitura opcional de instrumentos. AM/U oficiais ficam separadas do cálculo descritivo. Emissão grava somente o snapshot imutável; PDF e reimpressão não voltam às notas atuais. Ver [RELATIONAL_BULLETINS_V2.md](RELATIONAL_BULLETINS_V2.md).

Relatórios V2 é um agregador read-only e limitado dos contratos relacionais já vigentes. Desempenho e comparação usam V3/V4; Conselho usa V3; Auditoria consulta somente achados atuais; histórico/reimpressão usa exclusivamente snapshots V2. Não cria um segundo motor nem reinterpreta autoridade. Ver [RELATIONAL_REPORTS_V2.md](RELATIONAL_REPORTS_V2.md).

Auditoria atual V2 apresenta a fotografia de diagnósticos de 2026 e nenhuma operação de escrita. A substituição transacional da fotografia continua pertencendo ao fluxo de importação. A trilha humana futura requer contrato e durabilidade próprios; não se deduz nem se simula a partir do Audit Workspace antigo. Ver [RELATIONAL_CURRENT_AUDIT_V2.md](RELATIONAL_CURRENT_AUDIT_V2.md).

Alvo: PostgreSQL/fatos → núcleo acadêmico → read models compactos → experiências. Boletins emitidos e decisões humanas têm requisitos próprios de durabilidade; não inventar resultados ou snapshots para preencher lacunas.

## Segurança e publicação

Mesmo shell, Entra e autorização server-side. Respostas acadêmicas `no-store`, sem storage persistente no browser. Os handlers e gates têm composições diferentes; não declarar todas as rotas OFF/ON por uma única flag documental. #648/#654 não alteram binding, segredo ou identidade; suas relações novas têm ACL mínima para a role backend já provisionada.

Logs não podem divulgar payloads, SQL sensível, credenciais ou dados acadêmicos. Homologação de autenticação, consistência, frescor, concorrência e recuperação ocorre por consumidor antes do aceite #347/#406/#596.

Versão anterior integral: [`history/pre-final-1/ARCHITECTURE.md`](history/pre-final-1/ARCHITECTURE.md). Documentos D1 e runbooks de migração antigos permanecem memória técnica, não instrução para recriar o schema removido.
