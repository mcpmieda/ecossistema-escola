# Políticas por turno — aplicação produtiva 0022

Em 28/09/2026, com autorização do responsável, a migration
`0022_shift_policy_v1.sql` foi aplicada no Supabase `ecossistema-escola` como
**`20260928092734`** (`student_portal_shift_policy_v1`). Foi usado o SQL do head
`47ff8d6e391f100ff89de74f98bf3e1203e0fb65`, blob
**`4f380b4942c6b5f48f88fd80f70d8c6acf43779a`**, removendo somente o `BEGIN` e o
`COMMIT` externos, pois a operação de migração já executa em transação.

A [PR #1202](https://github.com/mcpmieda/ecossistema-escola/pull/1202) passou pelo
[gate de validação](https://github.com/mcpmieda/ecossistema-escola/actions/runs/36420551266),
pelo [runtime PostgreSQL](https://github.com/mcpmieda/ecossistema-escola/actions/runs/36420550667)
e pelo Sonar antes da aplicação.

## Pós-verificação técnica

- Histórico confirmou a versão e o nome acima; a restrição aceita o escopo de turno.
- As 10 configurações existentes permaneceram intactas: digest
  `1a63d08a72fbb0789b85c4a69b7d7eb7`, igual ao preflight. Nenhuma política de turno foi criada.
- A view `academic_class_v1` mantém `security_barrier=true`. `student_portal_app`
  pode consultá-la, mas não atualizá-la nem consultar diretamente o cadastro acadêmico;
  `anon` e `authenticated` não podem consultá-la.
- A função `pin_publication_auto_approval_v2` inclui a precedência do turno e preservou
  owner, ACL, `search_path=pg_catalog`, `SECURITY DEFINER` e ausência de execução direta
  por `student_portal_app`, conforme o preflight.
- O advisor de segurança retornou `lints: []` antes e depois da aplicação.

## Estado neste registro

**Migration aplicada e verificada; publicação do Worker pendente.** A ordem exigida é
migration antes do Worker compatível. Merge, deploy oficial e smoke serão registrados na
[issue #1201](https://github.com/mcpmieda/ecossistema-escola/issues/1201).
A validação funcional no ambiente real com o responsável permanece distinta dessas provas
técnicas e deve ser registrada separadamente.
