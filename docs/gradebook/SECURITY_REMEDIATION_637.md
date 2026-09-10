# Remediação de dependências — #637 / #641

## Evidência e escopo

Coleta e correção em 10/09/2026. Baseline integrada: `6683d1377f2dd090c1346f693a4af4c2e188d7ae`, PR #640, deploy 255 / `34477526551` aprovado. O registro de merge/deploy da correção está na #637 e na PR #641; este arquivo registra as fontes e os bytes verificados, não antecipa a publicação.

A triagem anterior (#637, comentário `5617136824`) encontrou seis entradas npm, quatro altas e duas moderadas, originadas em duas cadeias dev. Sem dev, zero entradas. As ferramentas de publicação também importam: não se interpreta devDependency como ausência de risco.

## Correção executada no código

| Cadeia | Correção |
| --- | --- |
| Miniflare → sharp/libheif | override `miniflare.sharp = 0.35.4`; sharp e seus binários passam de 0.35.2 para 0.35.4, pacotes sharp-libvips de 1.3.1 para 1.3.3 |
| office-addin-manifest → adm-zip | remoção da ferramenta sem chamadores encontrados e do override ineficaz `adm-zip >=0.6.0` |

O npm regenerou o lock: 40 entradas removidas e nenhuma adicionada. Mudanças de versão ficaram somente na família sharp/@img; houve também normalização de metadados sem mudança de versão em entradas @esbuild. Wrangler 4.125.0, @cloudflare/vitest-pool-workers 0.22.0 e demais versões fora da cadeia foram preservados. Nenhum `audit fix --force`, downgrade, patch de terceiros ou atualização indiscriminada de `latest`.

A busca estática e o grep no runner não encontraram uso do CLI/ZIP em src/server/functions/shared/scripts/public; scripts declarados e workflow de publicação não chamam o CLI. Isso não inventaria comandos manuais externos ao repositório. Office.js/types, fontes do add-in, importador e dados acadêmicos foram preservados. Não reinstalar a ferramenta vulnerável para uma futura validação manual sem nova revisão.

## Validação reproduzível

Run 551 / `34478370996`, job `102874656916`, Ubuntu / Node 22: geração npm do lock, `npm ci`, audits, `npm run verify`, smoke nativo e compilação de Pages Functions concluídos com sucesso.

- `npm audit --json`: **0** alertas em todas as severidades.
- `npm audit --omit=dev --json`: **0** alertas em todas as severidades.
- Smoke nativo: sharp **0.35.4**, libheif **1.23.2**, PNG/JPEG de 2×2 pixels gerados no próprio teste; nenhuma imagem ou planilha privada.
- `wrangler pages functions build functions`: compilação sem deploy e sem credenciais produtivas.

Lock verificado: SHA-256 `82a5b6fc21ce55225d445e58b6eb1756dfd51ba299c599e600b5b4d8b8ecf7e8`; blob Git `ad6059ec46be02970b340f97e7cbb585abd79715`. As duas auditorias referem-se exatamente a esses bytes. O artefato temporário do run 551 teve seu conteúdo e hash verificados antes de incorporar o blob; o lock não foi montado manualmente.

O workflow temporário gerou/validou o lock com contents:read. Um job isolado depositou somente o blob imutável, sem checkout/npm, execução de artefatos, secrets produtivos, mudança de ref ou merge. **O workflow original foi restaurado byte a byte no head final**; não existe automação permanente, autorreparo ou instalação que reescreva o lock. O head final ainda passa pela CI normal, cujo run/SHA ficam no checkpoint da #637/#641.

Quatro testes locais de regressão de dependências verificam sincronização manifest/lock, sharp corrigido, ausência de CLI/ZIP removidos e preservação de Office.js/types/postgres. Eles não substituem auditorias futuras.

## Fontes e manutenção

Avisos primários consultados em 10/09/2026:

- [sharp GHSA-rgj7-g3m4-5g8c](https://github.com/lovell/sharp/security/advisories/GHSA-rgj7-g3m4-5g8c): versões anteriores a 0.35.4 afetadas; a versão corrigida inclui libheif 1.23.2.
- [adm-zip GHSA-vwc7-r8mq-g2x9](https://github.com/advisories/GHSA-vwc7-r8mq-g2x9): 0.5.9–0.6.0 afetadas por escrita através de link simbólico no destino, com sobrescrita; sem versão corrigida indicada no aviso consultado. A remoção da cadeia no projeto não é correção upstream.

Em atualização futura do Miniflare, conferir se sua resolução nativa já é corrigida e retirar o override restrito somente após novo lock, audits e testes. Não manter pin antigo indefinidamente nem suprimi-lo antes dessa validação.

Zero alertas significa ausência de vulnerabilidades conhecidas reportadas na árvore consultada naquela data. Não é análise forense, prova de ausência de incidente ou auditoria integral da aplicação. Smoke autenticado/visual do Banco, recuperação produtiva e aceite acadêmico continuam nos gates #639/#406/#347/#596.
