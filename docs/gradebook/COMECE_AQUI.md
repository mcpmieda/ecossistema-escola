# Entrega corrente — Conselho relacional V3

**#648 / PR #653**, branch `feat/bn-council-final3-648`. Base publicada: `459443db90277baf55690fe69d35dbfdba8550f1`, incluindo o redesenho HeroUI de Desempenho, deploy 261 (`34559675760`).

A #646/PR #647 integrou fonte, siglas, detalhe e composição desktop. A #649/PR #650 fixou 2026, removeu criação/seleção de anos e entregou comparação descritiva entre trimestres. A #652 redesenhou os painéis de Desempenho. A #648/PR #653 concilia e implementa o Conselho V3 relacional. Não reconstruir blocos integrados. **Gravar cada bloco revisável em commit na branch antes de avançar; registrar SHA, testes e pendências na issue.** Objetos Git sem commit/ref e arquivos locais não são checkpoint suficiente.

Revisar o diff, executar `npm run verify`/CI do head final, preservar cópia lógica, aplicar/postvalidar a migration mínima, integrar com SHA esperado e conferir o workflow oficial de publicação. A autorização contínua BN-DEC-023 e a decisão #648 dispensam nova confirmação; não dispensam os gates. Estado de publicação e pendências: #648/#653.

Comparabilidade relacional continua indisponível porque a fonte não declara perfil/versionamento nem semântica de normalização entre períodos. Limiar de tendência, personalização e abertura padrão também aguardam decisão explícita. Não apresentar consulta calculada como emissão oficial; aceite #347 continua separado. [Contrato e limites](FINAL2_SOURCE_DESKTOP_646.md).

FINAL-1 #633 permanece aberta para manutenção docente, Boletins/Relatórios, fontes e durabilidade restantes; gestão de anos foi retirada pela #649. FINAL-2 #634 completa Desempenho e aguarda a validação visual única combinada. FINAL-3 #635 é a entrega corrente do Conselho. FINAL-4 #406 valida o produto integral; #596 fecha a entrega institucional. As branches reservadas precisam incorporar a main validada antes da execução.

Não reabrir a migração física #613 nem reativar importadores arquivados. Somente a extensão aditiva explicitamente contratada pela #648 pode alterar o schema nesta entrega; ela não altera dados ou regras acadêmicas. Somente 2026 é aceito; não criar ou comparar anos. Conselho segue [V3](RELATIONAL_COUNCIL_V3.md); comparação T2→T1 e T3→T1/T2 segue [BN-DEC-024](DECISIONS.md) e o [contrato V4](TERM_COMPARISON_2026_V4.md), sem inferência no navegador. Memória anterior em [history/pre-final-1/README.md](history/pre-final-1/README.md).
