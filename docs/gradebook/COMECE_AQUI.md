# Entrega corrente — 2026 fixo e comparação trimestral

**#646 / PR #647**, branch `fix/bn-final2-source-and-desktop-646`. Base publicada: `f580ce6523a453db6a9b99612104a12a3ef66ead`, incluindo #645, deploy 258 (`34519288361`).

A #646/PR #647 já integrou fonte, siglas, detalhe e composição desktop. A #649/PR #650 fixa o produto em 2026, remove criação/seleção de anos e entrega comparação descritiva entre trimestres. Não reconstruir blocos integrados. **Gravar cada bloco revisável em commit na branch antes de avançar; registrar SHA, testes e pendências na issue.** Objetos Git sem commit/ref e arquivos locais não são checkpoint suficiente.

Revisar o diff, executar `npm run verify`/CI do head final, integrar com SHA esperado e conferir o workflow oficial de publicação. A autorização contínua BN-DEC-023 dispensa nova confirmação por PR; não dispensa os gates. Estado de publicação e pendências: #646/#647.

Comparabilidade relacional continua indisponível porque a fonte não declara perfil/versionamento nem semântica de normalização entre períodos. Limiar de tendência, personalização e abertura padrão também aguardam decisão explícita. Não apresentar consulta calculada como emissão oficial; aceite #347 continua separado. [Contrato e limites](FINAL2_SOURCE_DESKTOP_646.md).

FINAL-1 #633 permanece aberta para manutenção docente, Boletins/Relatórios, fontes e durabilidade restantes; gestão de anos foi retirada pela #649. FINAL-2 #634 completa Desempenho e aguarda a validação visual única combinada; FINAL-3 #635 conclui Conselho; FINAL-4 #406 valida o produto integral. #596 fecha a entrega institucional. As branches reservadas precisam incorporar a main validada antes da execução.

Não reabrir a migração física #613, não reativar importadores arquivados, não alterar regras/dados/schema/credenciais por este roteiro. Somente 2026 é aceito; não criar ou comparar anos. Comparação T2→T1 e T3→T1/T2 segue [BN-DEC-024](DECISIONS.md) e o [contrato V4](TERM_COMPARISON_2026_V4.md), sem inferência no navegador. Memória anterior em [history/pre-final-1/README.md](history/pre-final-1/README.md).
