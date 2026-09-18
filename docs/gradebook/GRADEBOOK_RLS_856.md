# RLS do schema gradebook — #856 / BN-DEC-037

## Estado anterior

A auditoria produtiva encontrou as 30 tabelas de gradebook com RLS desabilitado. Não existia policy.

A ausência de RLS não correspondia a uma exposição direta pelos papéis de API: PUBLIC, anon e authenticated já estavam sem USAGE/CRUD efetivo no schema. O backend usa gradebook_app, role dedicada LOGIN, NOSUPERUSER e NOBYPASSRLS. service_role e postgres possuem BYPASSRLS por sua função administrativa e não são usados como identidade do Banco.

## Modelo aplicado

A migration 0011_gradebook_rls_v1.sql mantém ACL e RLS como camadas diferentes:

- ACL continua decidindo se gradebook_app pode SELECT/INSERT/UPDATE/DELETE em cada tabela.
- RLS passa a exigir também a policy gradebook_app_backend_v1.
- A policy é FOR ALL TO gradebook_app USING (true) WITH CHECK (true); ela não concede nenhum comando que a ACL tenha revogado.
- Todas as 30 tabelas atuais recebem ENABLE ROW LEVEL SECURITY.
- FORCE ROW LEVEL SECURITY não é usado; proprietários/migrations continuam operáveis.
- gradebook_app continua sem BYPASSRLS.
- PUBLIC, anon e authenticated têm schema/tabelas/sequências explicitamente revogados, inclusive default privileges do proprietário da migration.

A migration falha se o conjunto de tabelas mudar ou se gradebook_app estiver ausente/BYPASSRLS. Uma nova tabela futura exige decisão explícita de RLS em vez de entrar silenciosamente.

## Limite de escopo

O schema student_portal foi auditado separadamente e também possui tabelas com RLS desabilitado. Entretanto, anon/authenticated têm zero acesso efetivo às 27 tabelas e o Portal opera por student_portal_app, uma role backend própria. Habilitar RLS ali é outra fronteira de autorização/publicação e não faz parte da #856.

## Testes

O teste PostgreSQL real prova:

- 30 tabelas com RLS ON e FORCE OFF;
- uma policy backend exata em cada tabela;
- rolbypassrls=false para gradebook_app;
- grants de gradebook_app idênticos antes/depois da migration;
- SELECT e CRUD já concedidos continuam funcionando sob RLS;
- comando previamente revogado continua permission denied;
- anon/authenticated continuam sem acesso ao schema;
- dados existentes permanecem inalterados.

Produção exige preflight e pós-flight de catálogo, grants, contagens e teste de role, sem alterar dados acadêmicos.
