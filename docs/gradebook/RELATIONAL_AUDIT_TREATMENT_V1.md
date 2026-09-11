# Trilha humana da Auditoria V1 — #674

## Separação de responsabilidades

`gradebook.importacao_diagnostico` continua sendo apenas a fotografia das pendências atuais. A reimportação substitui esse conjunto de forma atômica; corrigir a fonte faz o achado desaparecer da lista.

`gradebook.importacao_diagnostico_tratamento` é a trilha humana append-only. Ela não possui FK para a linha corrente e, por isso, reconhecimento e anotação sobrevivem à remoção do achado. O vínculo funcional usa `ano + arquivo + chave`; o hash preserva a revisão de origem em que a ação foi registrada.

## Ações contratadas

- `1 — RECONHECIDO`: o usuário autorizado confirma que examinou o achado. Não exige nem aceita texto.
- `2 — ANOTAÇÃO`: acrescenta uma nota de tratamento entre 3 e 2.000 caracteres.

Não há estado manual `RESOLVIDO`, `IGNORADO` ou `DESCARTADO`. Também não há correção automática. Um achado só deixa de estar pendente quando a origem é corrigida e novamente observada pelo fluxo de importação. Registrar uma ação não altera nota, resultado, vínculo, Conselho, boletim, relatório ou autoridade.

## Persistência e privacidade

A relação copia somente o contexto mínimo necessário para entender a ação depois que o snapshot atual desaparecer: ano, fonte, hash, chave, severidade, código, turma, componente, período, número, espécie de campo e rótulo. Nome de aluno, valor encontrado, causa e coordenadas técnicas não são duplicados. Quando possível, a leitura resolve o nome atual pela Relação.

`registrado_por` é o OID UUID da sessão autenticada e nunca vem do payload. `registrado_em` usa o relógio transacional do PostgreSQL. A chave idempotente impede duplicação por retry e não pode ser reaproveitada para outro comando.

A tabela fica no schema privado `gradebook`. A role backend recebe apenas `SELECT` e `INSERT`; não recebe `UPDATE` ou `DELETE`. `PUBLIC`, `anon` e `authenticated` não recebem acesso. O endpoint exige a capability administrativa já vigente, origem oficial, credenciais same-origin, payload limitado e `Cache-Control: no-store`.

## Transporte e consultas

`POST /api/gradebook/audit-treatment`, contrato V1:

- `context`: recebe até 200 identidades visíveis e devolve suas ações em uma consulta limitada, sem N+1;
- `history`: pagina até 100 ações por cursor estável `(registrado_em, id)`, indicando se a identidade ainda existe entre os achados atuais sem deslocar páginas quando uma ação nova chega;
- `record`: grava reconhecimento ou anotação para um `diagnosticId` que ainda esteja pendente.

Leituras usam transação `REPEATABLE READ, READ ONLY`; escrita usa `SERIALIZABLE` e repete uma vez diante de aborto serializável/colisão concorrente. A interface mantém a Auditoria atual utilizável mesmo se a trilha ficar indisponível, carrega o histórico completo apenas sob demanda e reutiliza a chave idempotente quando uma tentativa tem resultado de rede incerto.

## Gate produtivo executado

O responsável autorizou explicitamente o DDL após o primeiro head verde da PR #675. Antes da aplicação foi criado um dump lógico privado das 29 relações produtivas; o arquivo teve checksum e catálogo validados, e seu restore integral foi comprovado em PostgreSQL 18 local descartável. O dump não foi enviado ao Git, CI ou issue.

O preflight confirmou `29` tabelas, `227` colunas, `203` constraints, `62` índices, `51` FKs, `12` sequências, `4` funções e `3` triggers, além de somente 2026, zero FK inválida e alvo ausente. A migration registrada `import_diagnostic_treatment_v1` aplicou o mesmo núcleo transacional de `0006_import_diagnostic_treatment_v1.sql`, sem backfill.

O postflight terminou em `30/246/218/66/52`, `13` sequências e preservou as quatro funções, três triggers e todas as contagens acadêmicas observadas antes do DDL. A relação nova nasceu vazia, com 19 colunas, 15 constraints, quatro índices e uma FK validada. `gradebook_app` recebeu somente `SELECT`, `INSERT` e uso/leitura da sequence; não recebeu `UPDATE`/`DELETE`, e `PUBLIC`, `anon` e `authenticated` ficaram sem leitura. O Advisor de segurança retornou zero alerta. Os dois avisos informativos de índices ainda não usados são esperados em uma tabela vazia.

O smoke autenticado deve usar somente a massa de teste já autorizada e não publicar nomes, notas, fontes, hashes ou OIDs. A aplicação da migration não equivale a aceite visual, autoridade acadêmica ou recuperação gerenciada.
