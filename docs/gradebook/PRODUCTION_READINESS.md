# Readiness — produto relacional e entrega institucional

## Evidência aceita e trabalho na branch

#613 homologou a persistência relacional/idempotência; #629, retenção de diagnósticos atuais; #632, arquivo dos importadores exclusivos. Essas evidências não comprovam todos os painéis, emissão/reimpressão, votação, restore ou autoridade acadêmica por consumidor.

A PR #636 agora inclui baseline de schema, lote de projeção e proteção transacional da Auditoria existente, além da documentação. **Código/testes na branch não são publicação.** `npm run verify` e testes PGlite/HTTP com identidade sintética não são smoke produtivo, benchmark Hyperdrive, contenção PostgreSQL multi-sessão nem recuperação de dados reais.

## Gates finais

| Gate | Responsável | Evidência |
| --- | --- | --- |
| Schema/runtime | #633 | replay/drift de schema e migração efetiva das fontes por endpoint |
| Desempenho | #634 | contrato funcional, população, comparabilidade, UI e medição |
| Conselho | #635 | lacunas contratuais, decisão humana, voto/fechamento e durabilidade |
| Produto integral | #406 | jornadas, restart/falhas, segurança, histórico e recuperação |
| Aceite acadêmico | #347 | consumidor/escopo, versão/vigência, divergências e emissões |
| Entrega | #596 | operação, responsáveis, recuperação e aceite final |
| Dependências | #637 | corrigir/mitigar as duas cadeias identificadas, repetir audit e verify |

## Recuperação não pode ser presumida

Uma migration existente não comprova restore. A pasta `migrations/gradebook-simplified/` reconstrói o schema atual e compara categorias estruturais com o catálogo observado: 20 tabelas, 127 colunas, 123 constraints, 38 índices, 4 funções e 3 triggers. NOT NULL é comparado por `attnotnull`; sua representação adicional em `pg_constraint` no PostgreSQL 18 é excluída para compatibilidade com PostgreSQL 17, sem excluir a regra.

As concessões backend são separadas da baseline. O teste usa roles sintéticas; restore de dados, contadores de identities, ACLs externas, timezone, recursos, RPO/RTO e operação real continuam gates #406/#596. Não executar DDL antigo de streams/versions. D1 histórico não contém as novas escritas; exclusão ou uso como rollback exige plano próprio.

## Autorização, isolamento e atomicidade

Verificar auth/capability, origem, limites, no-store, isolamento e respostas obsoletas por consumidor. Não inferir flags ON/OFF da documentação. O wrapper pode preparar conexão antes da autorização interna; o serviço não é a fronteira de acesso por si só.

O lote tem snapshot de uma instrução. A projeção anual ainda lê contexto e ofertas separadamente, pendência para emissão/decisão concorrentes. A Auditoria da branch usa **substituição transacional**: locks de fonte/conteúdo + DELETE/INSERT na mesma conexão, rollback se falhar e vazio enviado pelo navegador. A rota acadêmica não limpa diagnósticos separadamente. Falha de atualização gera aviso próprio e não deve parecer Auditoria confirmada. Nenhum registro de resolvido é acumulado.

V1 não tem sequência de observação entre abas: a última confirmada no servidor prevalece, sem inferência cronológica de arquivos atrasados. PGlite serializa conexões; teste local de chamadas concorrentes não comprova a disputa real entre conexões PostgreSQL. Recarregar clientes antigos após publicação autorizada para que enviem também o conjunto vazio.

A inspeção de ACL encontrou anon/authenticated sem USAGE e sem privilégios de tabela. RLS desativada isoladamente não prova exposição pública. Nenhuma permissão produtiva foi alterada; revalidar acesso efetivo e superfícies expostas no gate operacional.

## Segurança de dependências

A coleta #637/#638 identificou seis entradas npm em duas cadeias dev: sharp/libheif via Cloudflare e adm-zip via office-addin-manifest. Sem dev, zero entradas reportadas. Isso não prova risco zero: Wrangler é usado no processo de publicação. Correções ainda não executadas; não usar `npm audit fix --force` nem confundir CI verde com remediação.

## Hard stops e memória

Escrita parcial, perda de histórico, divergência material, autoridade ambígua, schema inesperado, recuperação insuficiente ou dado exposto interrompem o escopo afetado. Não editar planilha silenciosamente nem converter ausência em zero.

V1 `prepared-for-manual-authorization` e V2 `production-infrastructure-smoke-validated-awaiting-private-pilot` permanecem no [documento histórico](history/pre-final-1/PRODUCTION_READINESS.md); não comprovam configuração atual. Publicação exige autorização e evidência sanitizada. Ver [detalhes do bloco](CURRENT_SCHEMA_AND_DIAGNOSTICS.md).
