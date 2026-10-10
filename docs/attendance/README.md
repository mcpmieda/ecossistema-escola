# Frequência e conciliação — contrato candidato V1 (#1267)

Entrega preparada para revisão em PR rascunho. Nenhum endpoint foi montado no
roteador, nenhuma migração produtiva foi registrada ou executada, nenhum deploy,
merge, credencial ou mecanismo global de atualização automática foi criado.
`schema-v1.sql` é SQL candidato, separado das migrations executáveis existentes.

## Arquitetura e limites

- `shared/attendance-contracts/attendance-v1.ts`: payloads estritos Zod, limites,
  contratos de revisão e resumo mensal, sem dependência de frontend.
- `server/attendance/domain-v1.ts`: comparação, fingerprints, conciliação e resumo.
- `server/attendance/service-v1.ts`: transações no adaptador PostgreSQL existente;
  API intermediária, sem conexão PostgreSQL no PC coletor.
- `server/attendance/http-v1.ts`: factory de handler **não registrada**,
  `/api/attendance/v1`, POST com JSON limitado a 1 MiB, origem oficial e no-store
  em respostas de sucesso e erro. Admin/coletor reutilizam a sessão Entra e
  `gradebook.persistence.admin`. Não foi criada autorização técnica nova.
- `docs/attendance/schema-v1.sql`: schema privado, RLS, somente a role existente
  `gradebook_app`; histórico sem UPDATE/DELETE nessa role. PUBLIC, anon,
  authenticated e student_portal_app não recebem acesso.

O cadastro mestre é `gradebook.aluno` + `gradebook.turma` + `gradebook.vinculo`
da Relação anual atual. A pessoa é o `studentUid` canônico já persistido em
`gradebook.student_identity`. Vínculos históricos de origem de transferência
(`situacao=6`) são excluídos da referência corrente, conforme o predicado vigente
do Banco; os snapshots de frequência anteriores continuam preservados.
O módulo não cria pessoas, não mescla identidades
acadêmicas e não usa número da chamada como identidade. Nomes e turmas originais
da fonte são preservados; normalização remove acentos, agrupa espaços e compara
em maiúsculas apenas para a correspondência.

O escopo é `(academicYear,classId)` de uma turma efetivamente presente na Relação.
O repositório atualmente atende uma escola; não foi inventado um campo de tenant
ou uma política de responsáveis inexistente. Não reutilizar este escopo para uma
implantação com múltiplas escolas sem contrato e isolamento próprios.

## Operações da API preparada

| Operação          | Dados e resultado                                                                                                                                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `review`          | Escopo; revisão corrente, alunos da Relação, candidatos e histórico auditado, somente admin.                                                                                                                          |
| `configure`       | `requestId`, `expectedRevision`, calendário diário elegível e intervalos inclusivos de matrícula. Grava uma configuração imutável nova, ligada ao fingerprint da Relação.                                             |
| `lease`           | `requestId`, `collectorId`, duração entre 15 e 300 s; devolve revisão, prazo e fencing token monotônico. Renovação usa novo requestId e invalida token anterior.                                                      |
| `collect`         | Revisão esperada, lease/fencing, versão da fonte, identidade do relatório, observação, rosterComplete, registros, cobertura diária por registro e marcas X/J. Somente Diário Anual Detalhado coletivo neste contrato. |
| `decide`          | Revisão esperada, registro, studentUid, fingerprint exibido, motivo; `same-student` (É o mesmo aluno) ou `different-students` (São alunos diferentes).                                                                |
| `monthly-summary` | Escopo, studentUid e mês; exige adaptador de autorização do responsável, independente da conciliação e revalidado a cada leitura e antes da resposta. Sem adaptador, 403.                                             |

As versões de entrada são números inteiros seguros. Toda mutação possui receipt
transacional por escopo/requestId, vinculado ao ator da sessão e fingerprint do
payload. Repetição idêntica devolve apenas o recibo da mutação; payload diferente
ou outro ator no mesmo requestId resulta em conflito. Recibos nunca armazenam
respostas acadêmicas destinadas aos responsáveis.

`collect` usa sourceVersion como versão da **evidência coletada**, inclusive
observedAt: retry desse snapshot deve manter o mesmo conteúdo. Uma coleta nova
com observação/conteúdo diferentes precisa de versão nova; não reutilizar o hash
do arquivo como única versão se metadados/observações do snapshot mudaram.
Uma fonte inalterada pode ser revalidada sob outro fingerprint da Relação sem
alterar sua versão original. Nunca mudar a fonte para contornar um conflito.

## Conciliação e auditoria

Uma correspondência normalizada, única dos dois lados, com turma coincidente e
roster completo pode ser `identified`. Homônimos, duplicidades ou colisões da
normalização permanecem `needs-review`; divergência de turma/nome exige decisão
humana. A configuração de matrícula é separada: reconhecer uma pessoa não
determina a data de transferência nem cria vigência.

Cada decisão guarda ator, motivo, momento do servidor, revisão, fonte, registro,
studentUid e fingerprint. A revisão global do escopo rejeita o segundo revisor
com versão antiga. Reversão é outra decisão auditada; nada sobrescreve a decisão
anterior. Uma troca de aluno já vinculado exige rejeitar explicitamente o vínculo
anterior primeiro. Todos os vínculos devem continuar um-para-um.

`recordKey` identifica um registro reconhecível **na origem**, nunca a pessoa:
`reportIdentity` delimita o relatório e `identityBasis` declara `durable` ou
`report-local`. Só declarar durable quando a origem comprovar chave estável de
registro; posição/linha/chamada/nome não a comprovam. Quando só existe localização
no relatório, usar report-local. Nesse caso, decisões não são reaplicadas entre
versões da fonte. Esta limitação é explícita porque o contrato do Smecel ainda não
comprova chave durável disponível.

Rejeições retiram o aluno da lista sugerida para a mesma evidência reconhecível.
Em chaves duráveis, mudar apenas a versão global da coleta não reabre a sugestão;
alteração pertinente do registro ou de seus candidatos muda o fingerprint. A
Relação completa permanece disponível somente ao administrador para uma reversão
explícita. Confirmações humanas exigem o snapshot corrente; mudança de fonte ou
contexto da Relação exige revalidação, sem reaplicar silenciosamente uma decisão.

## Dados esparsos e resumo mensal

Somente X (falta) e J (justificativa) são armazenados como marcas; não há uma linha
de presença por aula. Calendário, intervalos de matrícula, cobertura por aluno/dia
e versão da fonte fornecem o denominador e a evidência de completude. Dias não
letivos, futuros e fora do vínculo são excluídos. Cobertura posterior ao dia da
observação é rejeitada; a passagem do tempo não transforma coleta antiga em
presença. Datas são dias civis no fuso escolar America/Sao_Paulo.

As seis posições Smecel são preservadas. O calendário deve representar posições
validadas para a fonte; não derivar cinco posições automaticamente do horário
físico. Se a cobertura tem seis posições e o calendário cinco, o resumo mantém
as marcas da sexta e bloqueia o percentual até alinhar a interpretação. O
denominador só é confiável quando as posições de calendário e cobertura coincidem
exatamente e todos os dias elegíveis possuem cobertura completa do aluno.

O resumo devolve mês, X e J separados, datas/aulas marcadas, denominador,
percentual descritivo `100 * (denominador - X - J) / denominador`, cobertura e última
observação. J não prova presença. Este percentual não substitui regra acadêmica
oficial ou percentual produzido pelo Smecel. Sem denominador positivo/cobertura
confiável, contagens totais, denominador e percentual ficam **null**, nunca zero;
marcas conhecidas do snapshot continuam disponíveis. Um zero só existe quando a
fonte comprova cobertura completa e ausência de X/J.

## Concorrência, preservação e leitura obsoleta

Cada transação trava a linha do escopo. A lease é vinculada ao coletor e ao ator,
com expiração pelo relógio PostgreSQL; toda ingestão valida token/ator/prazo dentro
da mesma transação da escrita. Renovação/takeover incrementa o token; gravações
antigas são recusadas. Observação anterior à fonte corrente também é recusada.
Lotes vazios são inválidos; parciais são acrescentados sem excluir evidência.

Configurações, matrículas, lotes, registros, coberturas, marcas e decisões são
append-only. O ponteiro corrente pode mudar; os snapshots anteriores permanecem.
Locks SHARE curtos sobre as tabelas da Relação impedem mudança entre a conferência
do cadastro e a escrita/leitura. São usadas as permissões da role gradebook_app
existente, sem ampliação ou role nova em produção.

Na leitura, o backend calcula novamente o fingerprint da Relação, incluindo
situação do vínculo e turma relacionada, sem inventar interpretação desses códigos.
Se aluno, turma, ano ou vínculo mudaram, a conciliação antiga não é visível, mesmo que ainda
exista no banco. A configuração de matrícula também deve ser revalidada. A API
não consulta cache de resumos, não usa ETag/304 e sempre revalida autorização e
elegibilidade. Uma interface futura deve descartar seus dados anteriores ao
receber erro/revisão nova; cabeçalhos HTTP não conseguem revogar informação já
mostrada ou copiada em um cliente.

## Lacunas reais antes de ativar

1. Escolher onde ficará a aba **Alunos**, no coletor ou no Ecossistema. Nenhuma
   tela definitiva ou navegação foi presumida.
2. Integrar o coletor com a autenticação intermediária já aprovada; ainda não há
   endpoint montado nem contrato confirmado de chave durável do Smecel. Sem
   credencial PostgreSQL no PC e sem criar novas credenciais nesta entrega.
3. Integrar a autorização real de responsáveis; a role ALUNO ou uma conciliação
   não concede acesso. O adaptador atual falha fechado quando ausente.
4. Definir/aprovar calendário e vigências reais. A importação atual da Relação não
   fornece datas de transferência confiáveis; não inferi-las pela decisão humana
   de identidade. Validar interpretação das seis posições e do percentual.
5. Integrar migração/ACL e roteiro de reset anual: as referências RESTRICT
   preservam a evidência e bloqueariam a exclusão de uma turma referenciada. O
   reset atual ainda não conhece attendance. Não aplicar o SQL em produção antes
   de resolver esse contrato; não acrescentar cascade para fazer o reset passar.
6. O resumo mensal lê o snapshot corrente, sem mesclar automaticamente fonte
   parcial com marcações antigas. O histórico é preservado, mas a consulta
   histórica dos snapshots e de turmas anteriores à transferência ainda não é
   uma API de responsáveis. Quando o snapshot novo é parcial, não publicar totais.
7. PGlite verifica SQL/constraints/ACL e a transação do adaptador, mas não substitui
   teste de contenção em múltiplas conexões de PostgreSQL/Hyperdrive reais, nem
   homologação funcional com fontes reais. Nenhum desses ambientes foi acessado.

## Verificação reproduzível

`npx vitest run tests/attendance` exercita regras e SQL candidato em PGlite
descartável. Toda fixture é explicitamente sintética. `npm run lint`,
`npm run typecheck` e `npm run build` usam o projeto existente. O workflow oficial
da PR executa `npm run verify` com o codec de fotos compilado por sua cadeia de
proveniência; não alterar gates para adaptar o ambiente local Windows.

Leituras de referência: AGENTS.md, docs/gradebook/README.md, PROJECT_STATE.yaml,
DECISIONS.md, CONSUMER_MAP.md, CONTRACTS.md, SOURCE_CONTRACT.md, TEST_MATRIX.md,
adaptador PostgreSQL, autorização e migration da identidade compartilhada.
`.agents/skills` não estava presente no clone. A memória local consultada só
continha preferências do usuário, não evidência acadêmica.
