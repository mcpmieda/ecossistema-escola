# Readiness — produto relacional e entrega institucional

## Evidência aceita, integração e branch

#613 homologou persistência/idempotência; #629, retenção de diagnósticos atuais; #632, arquivo dos importadores exclusivos. A #636 foi integrada em `4d8256fa6f741f4fb0b6ade8676d0f9193b7a460`, com deploy oficial 254 / `34468184541` aprovado. Inclui baseline de schema, lote de projeção e proteção transacional da Auditoria. Não houve smoke autenticado pós-deploy nesta sessão.

A PR #640, contrato #639, acrescenta contexto/pesquisa/Centrais V2. Seu código ainda pertence à branch: implementação e testes não são publicação. PGlite e HTTP com identidade sintética não são benchmark Hyperdrive, contenção PostgreSQL multi-sessão, restore de dados reais ou aceite visual. Nenhuma dessas entregas prova automaticamente Desempenho, emissão/reimpressão, votação ou autoridade por consumidor.

## Gates finais

| Gate | Responsável | Evidência |
| --- | --- | --- |
| Schema/runtime | #633; bloco #639/#640 | replay/drift e fontes relacionais por endpoint; Centrais de consulta não incluem resultados/escritas |
| Desempenho | #634 | contrato funcional, população, comparabilidade, UI e medição |
| Conselho | #635 | lacunas contratuais, decisão humana, voto/fechamento e durabilidade |
| Produto integral | #406 | jornadas, restart/falhas, segurança, histórico e recuperação |
| Aceite acadêmico | #347 | consumidor/escopo, versão/vigência, divergências e emissões |
| Entrega | #596 | operação, responsáveis, recuperação e aceite final |
| Dependências | #637 | remediar as duas cadeias identificadas, repetir audit e verify |

## Recuperação não pode ser presumida

Uma migration existente não comprova restore. `migrations/gradebook-simplified/` reconstrói o schema e compara com o catálogo observado: 20 tabelas, 127 colunas, 123 constraints, 38 índices, 4 funções e 3 triggers. NOT NULL é comparado por `attnotnull`; sua representação adicional em `pg_constraint` no PostgreSQL 18 é excluída para comparar com PostgreSQL 17, sem excluir a regra.

Grants backend são separados da baseline; testes usam roles sintéticas. Restore de dados, identities, ACLs externas, timezone, recursos, RPO/RTO e operação real continuam gates #406/#596. Não executar DDL de streams/versions. D1 histórico não contém as novas escritas; sua exclusão ou uso como rollback exige plano próprio.

## Autorização, isolamento e atomicidade

Verificar auth/capability, origem, limites, no-store, isolamento e respostas obsoletas por consumidor. Não inferir flags ON/OFF da documentação. O wrapper pode preparar conexão antes da autorização interna; o serviço não é a fronteira de acesso por si só.

O lote acadêmico tem snapshot de uma instrução. A projeção anual ainda lê contexto e ofertas separadamente; continua pendência para emissão/decisão concorrentes. O novo serviço cadastral da #640 usa transação read-only/repeatable-read para cada resposta completa, sem modificar o serviço anual. Paginação entre requisições diferentes não promete snapshot global de um catálogo que pode mudar.

A Auditoria integrada #636 usa **substituição transacional**: locks por fonte/conteúdo + DELETE/INSERT na mesma conexão; rollback e conjunto vazio enviado pelo browser. Notas não fazem limpeza paralela. Falha de atualização gera aviso; resolvidos não são acumulados. V1 não tem sequência entre abas: vale a última confirmada no servidor, sem inferência cronológica de arquivos atrasados. PGlite serializa conexões; testes não provam disputa multi-sessão real. Clientes antigos precisam recarregar para enviar também conjuntos vazios.

A inspeção de ACL anterior encontrou anon/authenticated sem USAGE/privilégios de tabela. Isso não dispensa revalidar exposição e privilégios no gate operacional. Nenhuma ACL/RLS foi alterada por essas PRs.

## Validação da nova interface

Fluxo #640: abrir Centrais, selecionar ano, pesquisar, abrir aluno/turma/professor/componente, navegar pelos vínculos/ofertas e carregar páginas. Testes de cliente/React/jsdom usam somente respostas sintéticas e verificam cancelamento, limpeza de escopo e perda de sessão. Validação visual em navegador, teclado completo, mobile e smoke autenticado real permanecem explícitos antes do aceite institucional; build verde não os substitui.

## Dependências e limites

A coleta #637/#638 identificou seis entradas npm em duas cadeias dev: sharp/libheif via Cloudflare e adm-zip via office-addin-manifest. Sem dev, zero entradas reportadas, não prova de risco zero: Wrangler participa da publicação. Nenhum pacote/lockfile mudou na #640. Correção permanece #637, sem `npm audit fix --force`.

Escrita parcial, perda de histórico, divergência material, autoridade ambígua, schema inesperado, recuperação insuficiente ou dado exposto interrompem o escopo afetado. Não editar fonte silenciosamente nem converter ausência em zero.

V1 `prepared-for-manual-authorization` e V2 `production-infrastructure-smoke-validated-awaiting-private-pilot` estão no [histórico](history/pre-final-1/PRODUCTION_READINESS.md), não descrevem a configuração atual. A nova #640 não tem autorização automática de merge/deploy. Ver [Centrais V2](RELATIONAL_CENTERS_V2.md) e [baseline/Auditoria](CURRENT_SCHEMA_AND_DIAGNOSTICS.md).
