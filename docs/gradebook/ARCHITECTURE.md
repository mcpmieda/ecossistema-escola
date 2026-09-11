# Arquitetura — estado relacional e consumidores em transição

Base auditada: `main@0a05606aa790bb3a4908308ec865e03438401b0a`. A PR #636 acrescenta lote de projeção e documentação; não ativa outro endpoint. O [mapa por consumidor](CONSUMER_MAP.md) é parte deste documento.

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

`GET/POST /api/gradebook/import-diagnostics` usa `gradebook.importacao_diagnostico` e resolve identificação do aluno por turma/vínculo/cadastro. A última observação de arquivo/ano substitui as ocorrências anteriores, conforme #629; resolvidos não formam histórico separado. O endpoint `/audit-workspace` antigo é outro consumidor e não deve ser confundido com essa implementação.

## Provedor não é modelo de dados

`withOfficialGradebookDatabaseV1` seleciona provider e, no caminho PostgreSQL, injeta um facade compatível em `GRADEBOOK_D1`. Isso permite que tipos ou nomes `D1ReadDatabaseV1`, `D1WriteDatabaseV1` e `d1-*` apareçam em código que executa em PostgreSQL.

O facade traduz sintaxe/parametrização; não reconstrói tabelas `academic_*_streams`, `*_versions`, snapshots ou sessões removidas. Consumidor que consulta essas relações não está migrado apenas porque recebe PostgreSQL. Não retirar o facade/portas ainda usados pelo importador.

O default do seletor físico ainda é `d1` quando a variável não é informada. Esta PR não altera a variável nem afirma que uma configuração ausente é aceitável em produção. O antigo admin D1 é roteado antes desse wrapper e precisa de tratamento separado.

## Projeções relacionais e motor

`relational-academic-projection-v1.ts` lê fatos e chama `resolve-simplified-academic-engine-v1.ts`. A projeção anual chama `resolve-simplified-annual-outcome-v1.ts`; nenhuma segunda fórmula é acrescentada na UI.

A leitura `projectMany` da PR #636 aceita até 1.000 pares únicos oferta/aluno, com parâmetros vinculados e **uma instrução SQL** para os fatos do lote. Preserva ordem solicitada e rejeita escopo ausente; não devolve zeros sintéticos. A projeção anual padrão usa três consultas: contexto, ofertas e lote. Isso elimina consultas por oferta nesse serviço, mas **não** prova ausência de N+1 de uma futura matriz de turma nem snapshot transacional das três consultas. Esses gates permanecem na #633.

A precedência de situações terminais continua no núcleo/serviço anual. O fato de não calcular resultado para ASSISTIDO não dispensa uma futura projeção de visualização das suas notas quando exigida pelo contrato de Desempenho/Boletim.

## Consumidores ainda não reancorados

O catch-all mantém operações V1 do Operational Workspace, Audit Workspace antigo, Boletins, Relatórios e Conselho compostos pelo runtime da geração anterior. A página de Desempenho usa V2/V3/V4 relacional. A #649 fixa o contexto em 2026 e remove criação/seleção de anos, mas não converte fontes ou durabilidade V1. Esses contratos restringem autoridades e recursos que não existem automaticamente nas 20 tabelas atuais. Ver `CONSUMER_MAP.md` antes de alterar qualquer um.

Alvo: PostgreSQL/fatos → núcleo acadêmico → read models compactos → experiências. Boletins emitidos e decisões humanas têm requisitos próprios de durabilidade; não inventar resultados ou snapshots para preencher lacunas.

## Segurança e publicação

Mesmo shell, Entra e autorização server-side. Respostas acadêmicas `no-store`, sem storage persistente no browser. Os handlers e gates têm composições diferentes; não declarar todas as rotas OFF/ON por uma única flag documental. Nenhuma variável/binding/role foi alterada nesta PR.

Logs não podem divulgar payloads, SQL sensível, credenciais ou dados acadêmicos. Homologação de autenticação, consistência, frescor, concorrência e recuperação ocorre por consumidor antes do aceite #347/#406/#596.

Versão anterior integral: [`history/pre-final-1/ARCHITECTURE.md`](history/pre-final-1/ARCHITECTURE.md). Documentos D1 e runbooks de migração antigos permanecem memória técnica, não instrução para recriar o schema removido.
