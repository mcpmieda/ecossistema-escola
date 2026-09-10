# Readiness — produto relacional e entrega institucional

## Evidência já aceita versus restante

#613 homologou a reconstrução e persistência relacional, incluindo idempotência do corpus. #629 homologou retenção somente de diagnósticos atuais. #632 arquivou importadores exclusivos. Essas evidências não comprovam automaticamente todos os painéis, emissão/reimpressão, votação, restore ou ativação acadêmica por consumidor.

A PR #636 é preparatória: documentação e lote de projeção, sem endpoint/autoridade/infraestrutura produtiva alterados. `npm run verify` e testes PGlite são gates de código; não são acesso HTTP autenticado, benchmark de Hyperdrive nem recuperação real de produção.

## Gates finais

| Gate | Responsável | Evidência exigida |
| --- | --- | --- |
| Verdade de schema/runtime | #633 | baseline reproduzível e drift; dependências por endpoint; fontes relacionais reais |
| Desempenho | #634 | contrato funcional, população, comparabilidade, UI e medidas reproduzíveis |
| Conselho | #635 | contrato de lacunas, decisão humana, concorrência, voto/fechamento e durabilidade |
| Produto integral | #406 | todas as jornadas, restart/falhas, segurança, histórico e recuperação |
| Aceite acadêmico | #347 | consumidor/escopo, versão/vigência, divergências reconciliadas e efeito nas emissões |
| Entrega institucional | #596 | operação/runbook, responsáveis, recuperação e aceite final |

## Recuperação não pode ser presumida

Uma migration existente não comprova restore. Recuperar a definição completa de tabelas, FKs, índices, funções, triggers, privilégios e ajustes posteriores; reconstruir em ambiente descartável e comparar com o catálogo antes de publicar como baseline utilizável. Não executar DDL da arquitetura antiga sobre o banco reconstruído.

D1 preservado é memória/contingência do período anterior, não cópia das novas escritas relacionais. Sua retirada ou uso como rollback exige plano explícito sobre perda temporal e compatibilidade. Nenhuma exclusão de banco/recurso é autorizada por este documento.

## Autorização, isolamento e atomicidade

Verificar por handler auth/capability, origem, limites, respostas opacas, `no-store`, isolamento de ano/usuário e descarte de respostas antigas. Não inferir flags ON/OFF pela documentação. O wrapper pode preparar conexão antes da autorização interna; os serviços não são fronteira de autorização por si só.

O lote de fatos tem snapshot de uma instrução. A projeção anual completa ainda lê contexto e ofertas separadamente; sua consistência sob mudança concorrente precisa de gate explícito antes de emissão/decisão. A substituição de diagnósticos atualmente usa DELETE/INSERT separados; testar falha entre etapas e concorrência e fechar atomicidade antes de dar garantia mais ampla que a homologação normal da #629. Isso não muda a retenção desejada nem a regra acadêmica.

Sem RLS não implica, isoladamente, acesso público; confirmar exposição de schema e ACLs de `anon`/`authenticated` e privilégio da role de aplicação. A inspeção somente leitura da retomada encontrou ausência de USAGE e zero privilégios de tabela nessas duas roles; não houve aplicação automática de RLS/permissões. Revalidar no gate operacional, sem tratar essa leitura como auditoria completa de segurança.

## Hard stops

Parar o escopo afetado em caso de escrita parcial, perda de histórico, divergência acadêmica material não reconciliada, fonte/autoridade ambígua, schema inesperado, recuperação não comprovada ou exposição de dado real. Nunca corrigir silenciosamente a planilha nem converter ausência em zero para liberar a jornada.

## Memória histórica

V1 `prepared-for-manual-authorization` e V2 `production-infrastructure-smoke-validated-awaiting-private-pilot` permanecem em [documento histórico](history/pre-final-1/PRODUCTION_READINESS.md) e nos manifestos existentes. Seus testes não constituem prova da configuração atual nem devem congelar a documentação em produção OFF.

Integração/publicação exigem autorização. A evidência final registra commit, execução de CI e teste funcional aplicável sem nomes, notas, arquivos, hashes privados ou credenciais.
