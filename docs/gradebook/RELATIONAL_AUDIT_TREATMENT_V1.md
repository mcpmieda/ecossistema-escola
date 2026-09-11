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
- `history`: pagina até 100 ações, indicando se a identidade ainda existe entre os achados atuais;
- `record`: grava reconhecimento ou anotação para um `diagnosticId` que ainda esteja pendente.

Leituras usam transação `REPEATABLE READ, READ ONLY`; escrita usa `SERIALIZABLE` e repete uma vez diante de aborto serializável/colisão concorrente. A interface mantém a Auditoria atual utilizável mesmo se a trilha ficar indisponível, carrega o histórico completo apenas sob demanda e reutiliza a chave idempotente quando uma tentativa tem resultado de rede incerto.

## Gate produtivo

A migration `0006_import_diagnostic_treatment_v1.sql` é aditiva e não faz backfill. Nesta entrega ela é validada em PostgreSQL descartável e versionada no Git, mas não pode ser aplicada em produção sem autorização explícita do responsável para alterar o schema. Código dependente também não deve ser integrado/publicado antes desse gate, evitando uma superfície parcialmente ativa.

Aplicação futura exige backup privado recuperável, preflight de catálogo/ACL/ano, migration transacional, postflight da nova relação vazia e smoke autenticado com dados de teste. O teste não deve publicar nomes, notas, fontes, hashes ou OIDs reais.
