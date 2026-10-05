# Postflight 0014 — EXECUTE nas quatro funções Gradebook

## Aplicação autorizada

- Projeto: Ecossistema Escola, PostgreSQL 17.6.
- Migration: `function_execute_hardening_v1`, ledger `20261005151011`.
- Aplicada em 05/10/2026, 18:10 UTC; postflight read-only às 18:11 UTC.
- Artefato aprovado: `migrations/gradebook-simplified/0014_function_execute_hardening_v1.sql`
  no head `4def195888cfde798d2fc8e149b12e3135207ff9`.
- SHA-256 do SQL: `28490011a920f36aad3543d928af6999733c99e2d65532b53b3f27283712d19d`.
- Gates prévios: [verify 37334410485](https://github.com/mcpmieda/ecossistema-escola/actions/runs/37334410485)
  e [PostgreSQL 37334409688](https://github.com/mcpmieda/ecossistema-escola/actions/runs/37334409688).
- Preflight Cloudflare: [11 namespaces livres](https://github.com/mcpmieda/ecossistema-escola/issues/1249#issuecomment-6000251034),
  antes de qualquer ativação dos limites da PR #1250.

O ledger conserva sua versão literal; seu número não deve ser reinterpretado como
horário UTC. A anotação de candidato no SQL pertence ao artefato pré-aplicação,
que foi preservado byte a byte. Merge/deploy não reaplica automaticamente o SQL.

## Resultado confirmado por catálogo

As quatro assinaturas continuam presentes, owner `postgres`, SECURITY INVOKER:

- `gradebook.aluno_possui_vinculo_na_oferta(integer,integer)`
- `gradebook.preparar_conselho_anterior()`
- `gradebook.validar_fechamento_vinculo()`
- `gradebook.validar_nota_vinculo()`

ACL anterior em 4/4: `{=X/postgres,postgres=X/postgres,gradebook_app=X/postgres}`.
ACL posterior em 4/4: `{postgres=X/postgres,gradebook_app=X/postgres}`.

- PUBLIC EXECUTE: false em 4/4.
- Owner e gradebook_app: EXECUTE preservado em 4/4, com grant explícito próprio.
- anon, authenticated e student_portal_app: EXECUTE=false, inclusive por caminhos
  SET ROLE; USAGE/CREATE no schema continuam false.
- Checksums dos corpos idênticos e três triggers preservados (0/1/1/1 por assinatura).
- Schema ACL inalterada: `{postgres=UC/postgres,gradebook_app=U/postgres}`.
- Catálogo relacional inalterado: checksum `6b5816ef31aeeb8bad34109cf4fd1472`,
  31 tabelas, 31 com RLS. Checksum é comparação de drift, não garantia criptográfica.
- Default global de funções do owner inalterado: `{postgres=X/postgres}`.

O preflight repetiu owner/assinaturas/retornos/grants, roles de aplicação não-superuser e
não-BYPASSRLS, memberships e ledger. A aplicação usou a transação e os checks
internos do arquivo, sem alterar permissões para forçar um resultado positivo.
A conferência posterior foi exclusivamente de catálogo/ledger, em transação
read-only; não leu nomes, notas ou arquivos e não escreveu fatos acadêmicos.

## Limites e recuperação

A ACL anterior era excessiva, mas os papéis externos já não tinham USAGE no schema;
a evidência não demonstra RPC público explorável. Não foi alterado RLS por aluno,
corpo de função, trigger, owner, schema, tabela, default ou membership.

A prova funcional dos consumidores e dos triggers ocorreu em PostgreSQL descartável
no CI. Não foram criadas notas, fechamentos ou sessões de Conselho em produção.
Uso real autenticado continua pertencendo ao responsável; esta evidência não prova
capacidade, TLS efetivo/verify-full ou exposição da Data API.

Não há rollback automático que reabra PUBLIC. Se houver consumidor legítimo não
inventariado, identificar role e assinatura e obter autorização para grant pontual,
conforme [plano de recuperação](./FUNCTION_EXECUTE_1128.md#rollback-e-recuperação).
A publicação dos limites de requisição é verificada separadamente pelo workflow
oficial da PR #1250; este registro comprova somente a mudança SQL descrita.
