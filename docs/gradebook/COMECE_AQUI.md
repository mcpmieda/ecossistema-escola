# Entrega corrente — leituras acadêmicas e matriz relacional

**#642 / PR #643**, branch `feat/bn-relational-performance-642`. Base publicada: `cb6e3bf2309d4aa5716b600a3957046f133f850c`, deploy 256. O bloco cadastral #640 e a correção de segurança #641 já estão integrados/publicados.

A implementação da primeira matriz está salva no GitHub: contrato V2, fonte SQL em lote, motor reutilizado, ano compartilhado, tela e testes. Não reconstruir novamente esse código por falta de uma pasta temporária. **Gravar cada bloco revisável em commit na branch antes de avançar; registrar SHA, testes e pendências na issue.** Objetos Git sem commit/ref e arquivos locais não são checkpoint suficiente.

Revisar o diff, executar `npm run verify`/CI do head final, integrar com SHA esperado e conferir o workflow oficial de publicação. A autorização contínua BN-DEC-023 dispensa nova confirmação por PR; não dispensa os gates. Estado de publicação e pendências visuais/autenticadas: #642/#643.

Depois desta entrega, avançar em um bloco funcional da #634: lentes, comparabilidade explicitamente contratada, indicadores/gráficos investigáveis e configurações. Não apresentar consulta calculada como emissão oficial; aceite #347 continua separado. [Contrato e limites](RELATIONAL_PERFORMANCE_V2.md).

FINAL-1 #633 permanece aberta para manutenção/gestão de anos, Boletins/Relatórios, fontes e durabilidade restantes; FINAL-2 #634 completa Desempenho; FINAL-3 #635 conclui Conselho; FINAL-4 #406 valida o produto integral. #596 fecha a entrega institucional. As branches reservadas precisam incorporar a main validada antes da execução.

Não reabrir a migração física #613, não reativar importadores arquivados, não alterar regras/dados/schema/credenciais por este roteiro. Comparabilidade, recuperação e resultados não são inferidos no navegador. Memória anterior em [history/pre-final-1/README.md](history/pre-final-1/README.md).
