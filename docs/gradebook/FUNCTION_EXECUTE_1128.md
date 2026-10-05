# ACL das funções existentes — #1128 / #1249

## Estado e limite

**CANDIDATO NÃO APLICADO.** `0014_function_execute_hardening_v1.sql` é um
artefato revisável. Esta entrega não executa SQL remoto, não muda permissões
produtivas e não prova aplicação em produção. Integração/deploy da aplicação não
aplica esta migration nem substitui sua autorização própria.

Consulta produtiva **somente leitura em 05/10/2026, 14:58:46 UTC** confirmou,
para as quatro assinaturas abaixo, owner `postgres`, `SECURITY INVOKER` e ACL
`{=X/postgres,postgres=X/postgres,gradebook_app=X/postgres}`. Portanto existe
`EXECUTE` de `PUBLIC` no objeto. `anon`, `authenticated` e `student_portal_app`
não possuem `USAGE` em `gradebook`; essa ACL isolada **não comprova RPC público
explorável**. Não houve teste de chamada ou de escrita em produção.

`gradebook_app` tem `USAGE`, sem `CREATE` no schema, e grant explícito `EXECUTE`
nas quatro funções. Os dois apps não são superuser/BYPASSRLS e não foram
observadas memberships para os papéis inspecionados. Revalidar essas condições
imediatamente antes de qualquer aplicação autorizada; a fotografia não é uma
permissão permanente.

A `0013` já aplicada endurece defaults de objetos futuros. Não corrige ACLs de
funções preexistentes. A reconstrução `0001_current_schema.sql` do Git **já
revoga `PUBLIC`**; reproduzir somente essa baseline daria uma prova insuficiente.
Os testes acrescentam explicitamente o drift observado, apenas em bancos
sintéticos descartáveis, antes de exercitar `0014`.

## Escopo fechado

| Assinatura exata                                            | Retorno | Consumidor legítimo                                             |
| ----------------------------------------------------------- | ------- | --------------------------------------------------------------- |
| `gradebook.aluno_possui_vinculo_na_oferta(integer,integer)` | boolean | helper chamado pelos validadores de vínculo e pela role backend |
| `gradebook.preparar_conselho_anterior()`                    | trigger | trigger existente de `gradebook.aluno`                          |
| `gradebook.validar_fechamento_vinculo()`                    | trigger | trigger existente de `gradebook.fechamento`                     |
| `gradebook.validar_nota_vinculo()`                          | trigger | trigger existente de `gradebook.nota`                           |

Mudança única: `REVOKE EXECUTE` dessas assinaturas de `PUBLIC` e, quando os
papéis existem, de `anon` e `authenticated`, sempre `RESTRICT`.

Preservados: grant explícito de `gradebook_app`, owner e quaisquer outros grants
específicos já existentes fora dos alvos. O catálogo observado não apresentou
outros consumidores explícitos. Um consumidor novo/divergente deve ser
identificado no preflight; não se remove sua ACL por inferência.

Não há `CASCADE`, mudança de corpo/assinatura/owner/`SECURITY INVOKER`, schema
USAGE/CREATE, ACL de tabela/sequence, RLS, default global ou por schema,
roles/memberships, DML/backfill, tráfego RPC, nem ampliação de acesso do Portal.
Não reaplicar `application_role_grants.sql` como remediação: esse provisionamento
amplo também configura defaults, fora do escopo pontual.

## Transação e recusas

Todos os checks e quatro revokes ficam em uma única transação. Antes da primeira
mutação, o script exige:

- PostgreSQL 16+ para `pg_has_role(..., 'SET')`; produção e gate nativo
  inspecionados usam PostgreSQL 17.6;

- schema existente, executado pelo seu owner; esse owner não pode ser
  `gradebook_app`, `student_portal_app`, `anon` ou `authenticated`;
- quatro assinaturas presentes, owner igual ao owner do schema, retornos
  boolean/trigger esperados e `SECURITY INVOKER`;
- `gradebook_app` existente, não-superuser/não-BYPASSRLS, com `USAGE` e grant
  explícito próprio em todas as funções. Acesso herdado de `PUBLIC` não basta.

Na produção inspecionada, o owner esperado é **`postgres`**. O preflight abaixo
fixa esse fato operacional. O contrato estrutural do SQL permite o owner
legítimo equivalente de um banco de teste (`portal_test_admin` no gate nativo),
sem editar a migration nem tornar a role de aplicação owner/superuser. Owner
diferente entre schema e função é drift e falha; owner produtivo divergente de
`postgres` exige interromper e revisar o preflight, não ajustar permissões para
forçar aprovação.

O postflight interno exige `PUBLIC=false`, owner/backend ainda autorizados e
ACLs específicas não-alvo exatamente preservadas. Para os três papéis
`anon`/`authenticated`/`student_portal_app`, verifica tanto `has_function_privilege`
quanto funções acessíveis por qualquer role alcançável com `pg_has_role(...,
'SET')`. Isso cobre INHERIT e NOINHERIT com possibilidade de `SET ROLE`. Se uma
membership ou grant inesperado mantiver acesso, a transação falha inteira;
o script não revoga memberships nem grants do Portal para fazer o teste passar.

A ausência de `USAGE` não deve mascarar `EXECUTE` residual no postflight. Os
checks garantem o catálogo observado naquela transação; não impedem um
administrador de conceder acesso posteriormente. Coordenar a aplicação sem
mudanças simultâneas de ACL/owner/membership e registrar o resultado imediatamente.

## Preflight e postflight somente de metadados

Executar as consultas abaixo em transação read-only, pela rota de diagnóstico
já autorizada. Elas não leem fatos acadêmicos nem invocam as funções-alvo.
Guardar a evidência sanitizada com instante, revisão do artefato e resultado;
não publicar credenciais, string de conexão ou dados de estudantes.

```sql
BEGIN READ ONLY;

SELECT current_user, current_setting('server_version_num')::integer AS server_version_num,
  current_setting('server_version_num')::integer >= 160000 AS supported_version;

-- Reutilizar este conjunto exato antes e depois. Ausência produz oid/owner NULL.
WITH target(signature) AS (VALUES
  ('gradebook.aluno_possui_vinculo_na_oferta(integer,integer)'),
  ('gradebook.preparar_conselho_anterior()'),
  ('gradebook.validar_fechamento_vinculo()'),
  ('gradebook.validar_nota_vinculo()')
)
SELECT t.signature, p.oid, pg_get_userbyid(p.proowner) AS function_owner,
  pg_get_userbyid(n.nspowner) AS schema_owner,
  p.prokind, p.prorettype::regtype AS result_type, p.prosecdef,
  p.proacl::text AS explicit_acl,
  EXISTS (SELECT 1
    FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
    WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute,
  md5(pg_get_functiondef(p.oid)) AS definition_checksum,
  (SELECT count(*) FROM pg_trigger tr WHERE tr.tgfoid=p.oid) AS trigger_count
FROM target t LEFT JOIN pg_proc p ON p.oid=to_regprocedure(t.signature)
LEFT JOIN pg_namespace n ON n.oid=p.pronamespace
ORDER BY t.signature;

-- Privilégio efetivo no objeto, fronteira de schema e grant explícito separados.
WITH target(signature) AS (VALUES
  ('gradebook.aluno_possui_vinculo_na_oferta(integer,integer)'),
  ('gradebook.preparar_conselho_anterior()'),
  ('gradebook.validar_fechamento_vinculo()'),
  ('gradebook.validar_nota_vinculo()')
)
SELECT r.rolname, t.signature, r.rolsuper, r.rolbypassrls,
  has_schema_privilege(r.oid,'gradebook','USAGE') AS schema_usage,
  has_schema_privilege(r.oid,'gradebook','CREATE') AS schema_create,
  has_function_privilege(r.oid,p.oid,'EXECUTE') AS effective_execute,
  EXISTS (SELECT 1
    FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
    WHERE a.grantee=r.oid AND a.privilege_type='EXECUTE') AS explicit_execute,
  EXISTS (SELECT 1 FROM pg_roles reachable
    WHERE pg_has_role(r.oid,reachable.oid,'SET')
      AND has_function_privilege(reachable.oid,p.oid,'EXECUTE')) AS executable_via_set_role
FROM target t LEFT JOIN pg_proc p ON p.oid=to_regprocedure(t.signature)
CROSS JOIN pg_roles r
WHERE r.rolname IN ('postgres','gradebook_app','anon','authenticated','student_portal_app')
ORDER BY r.rolname,t.signature;

-- Grants/memberships são metadados; não selecionar pg_authid nem senhas.
SELECT member.rolname AS member_role, parent.rolname AS granted_role,
  m.admin_option, m.inherit_option, m.set_option
FROM pg_auth_members m
JOIN pg_roles member ON member.oid=m.member
JOIN pg_roles parent ON parent.oid=m.roleid
WHERE member.rolname IN ('gradebook_app','anon','authenticated','student_portal_app')
ORDER BY member.rolname,parent.rolname;

-- Defaults devem ficar idênticos. NULL namespace é o default global do owner.
SELECT r.rolname AS owner, n.nspname AS schema, d.defaclobjtype, d.defaclacl::text
FROM pg_default_acl d JOIN pg_roles r ON r.oid=d.defaclrole
LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
WHERE r.rolname='postgres' AND (d.defaclnamespace=0 OR n.nspname='gradebook')
ORDER BY d.defaclnamespace,d.defaclobjtype;

COMMIT;
```

Critérios antes:

1. Exatamente quatro assinaturas presentes, owner de função/schema `postgres`,
   `prosecdef=false`, retorno boolean na primeira e trigger nas outras três.
2. ACL observada acima e `gradebook_app` com grant próprio; divergência exige
   revisão dos consumidores e pausa, sem improvisar a aplicação.
3. `gradebook_app`: USAGE=true, CREATE=false, sem superuser/BYPASSRLS.
   `anon`, `authenticated`, `student_portal_app`: USAGE=false e CREATE=false.
   Antes da correção, effective_execute/via_set_role podem ser true por PUBLIC.
4. Conferir memberships diretas e caminhos transitivos (`executable_via_set_role`);
   confirmar owner/roles da sessão executora por metadados, sem executar app como owner.
5. Registrar defaults e checksums; o default global de funções de `postgres`
   observado já não concede PUBLIC. A migration não pode alterá-lo.

Critérios depois da aplicação **separadamente autorizada**:

1. Quatro `public_execute=false`, owner/definição/retorno/triggers inalterados.
2. `gradebook_app`: explicit_execute=true e effective_execute=true em 4/4;
   owner continua com EXECUTE. Outros grants legítimos permanecem iguais.
3. Os três papéis externos: effective_execute=false e
   executable_via_set_role=false em 4/4. USAGE/CREATE continuam false.
4. Defaults permanecem idênticos; registrar checksums/ACLs antes/depois e versão
   real aplicada. Checksum MD5 é comparação de drift, não garantia criptográfica.
5. Não gerar notas, fechamento ou Conselho reais no postflight. Validação
   funcional produtiva pertence ao fluxo autenticado normal com o responsável;
   testes sintéticos não substituem essa evidência.

## Rollback e recuperação

- Falha antes do COMMIT deixa a transação abortada: executar `ROLLBACK` na mesma
  sessão e conferir a ACL anterior. Nunca continuar com partes do arquivo.
- Antes de COMMIT, cancelar toda a transação é a recuperação preferida. Erro de
  owner, assinatura ou membership deve ser diagnosticado sem conceder acesso.
- Depois do COMMIT, não existe down automático que restaure `PUBLIC`, `anon` ou
  `authenticated`. Não reaplicar grants abrangentes ou defaults antigos.
- Se surgir um consumidor legítimo ausente do inventário, identificar role,
  assinatura, uso e risco. Após autorização específica, preparar correção
  explícita `GRANT EXECUTE ON FUNCTION <assinatura exata> TO <role aprovada>`
  dentro de transação, sem grant option e com pre/postflight equivalentes.
  O exemplo é um roteiro para revisão, não SQL para executar com placeholders.
- Restaurar acesso de `gradebook_app`, se removido por outro evento, exige apenas
  seus grants pontuais confirmados e autorização aplicável; não reabrir PUBLIC
  como atalho. Não há rollback de dados, funções ou triggers nesta migration,
  porque não são alterados.

## Evidência técnica e gates

`tests/gradebook/relational-schema/function-execute-1128.test.ts` usa PGlite
local com as migrations correntes `0001`, `0003`–`0013` e dados exclusivamente
sintéticos. Cobre drift PUBLIC true→false em 4/4, grants específicos/clientes,
roles opcionais ausentes, acesso negado com/sem USAGE, app não-owner/
não-superuser, helper e três triggers, valores/fatos/catálogo/defaults preservados,
reexecução e rollback diante de drift ou membership INHERIT/NOINHERIT.

O caso novo em `tests/student-portal/runtime/migrations.postgres.ts` reutiliza o
banco local descartável, bootstrap e conexões existentes do gate PostgreSQL
nativo. Aplica o arquivo sem modificá-lo como owner de teste e usa conexão real
`gradebook_app` não-owner/não-superuser/não-BYPASSRLS para helper e escritas.
As linhas sintéticas ficam em transação revertida; não altera budgets/asserts
anteriores, workflows ou governança. Os casos posteriores do replay também
continuam exercitando o backend com as quatro funções endurecidas.

Validação local em 05/10/2026: **22/22 testes passaram** (16 novos de ACL e
6 existentes de RLS); ESLint dos dois arquivos de teste, Prettier dos arquivos
novos de teste/documentação e `git diff --check` passaram. PostgreSQL nativo
**não executado neste executor**, que não dispõe do cluster local: o caso está
integrado ao gate existente e seu resultado deve ser registrado no head final.

Comandos direcionados:

```sh
npx vitest run tests/gradebook/relational-schema/function-execute-1128.test.ts
npx vitest run --config tests/student-portal/runtime/vitest.postgres.config.ts tests/student-portal/runtime/migrations.postgres.ts -t 'hardens only the four existing Gradebook function ACLs'
```

O segundo comando exige o cluster descartável já previsto em
`PORTAL_TEST_DATABASE_URL` (`127.0.0.1`, banco `portal705_test`), jamais produção.
Integração continua sujeita a `npm run verify` e ao gate nativo do head final.
Registrar separadamente teste PGlite, execução PostgreSQL nativa, integração,
aplicação produtiva e validação real. Nenhum desses estados se infere de outro.

Referências PostgreSQL: [privilégios de funções](https://www.postgresql.org/docs/17/ddl-priv.html),
[privilégios efetivos e `pg_has_role`/SET](https://www.postgresql.org/docs/17/functions-info.html)
e [privilégios de criação de triggers](https://www.postgresql.org/docs/17/sql-createtrigger.html).
A recusa da chamada direta de uma função de trigger, sozinha, não prova a
continuidade do caminho legítimo; por isso a cobertura inclui as escritas que
disparam os triggers reais sob a role de aplicação.
