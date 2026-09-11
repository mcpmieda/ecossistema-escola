# Entrega corrente — fonte, ano global e composição desktop

**#646 / PR #647**, branch `fix/bn-final2-source-and-desktop-646`. Base publicada: `f580ce6523a453db6a9b99612104a12a3ef66ead`, incluindo #645, deploy 258 (`34519288361`).

A branch já contém a normalização de placeholders qualitativos por evidência, siglas observadas na fonte, predicado relacional não destrutivo, ano global, detalhe do aluno e composição desktop. Não reconstruir esses blocos. **Gravar cada bloco revisável em commit na branch antes de avançar; registrar SHA, testes e pendências na issue.** Objetos Git sem commit/ref e arquivos locais não são checkpoint suficiente.

Revisar o diff, executar `npm run verify`/CI do head final, integrar com SHA esperado e conferir o workflow oficial de publicação. A autorização contínua BN-DEC-023 dispensa nova confirmação por PR; não dispensa os gates. Estado de publicação e pendências: #646/#647.

Comparabilidade relacional continua indisponível porque a fonte não declara perfil/versionamento nem semântica de normalização entre períodos. Limiar de tendência, personalização e abertura padrão também aguardam decisão explícita. Não apresentar consulta calculada como emissão oficial; aceite #347 continua separado. [Contrato e limites](FINAL2_SOURCE_DESKTOP_646.md).

FINAL-1 #633 permanece aberta para manutenção/gestão de anos, Boletins/Relatórios, fontes e durabilidade restantes; FINAL-2 #634 completa Desempenho; FINAL-3 #635 conclui Conselho; FINAL-4 #406 valida o produto integral. #596 fecha a entrega institucional. As branches reservadas precisam incorporar a main validada antes da execução.

Não reabrir a migração física #613, não reativar importadores arquivados, não alterar regras/dados/schema/credenciais por este roteiro. O ano da navegação não reinterpreta o ano reconhecido na planilha; comparabilidade, recuperação e resultados não são inferidos no navegador. Memória anterior em [history/pre-final-1/README.md](history/pre-final-1/README.md).
