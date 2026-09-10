# Importador legado D1 — V2 a V8

Este arquivo preserva o importador que antecedeu o modelo relacional PostgreSQL atual.

## Arquitetura preservada

O fluxo evoluiu aproximadamente assim:

`XLSB no navegador → reconhecimento → contratos V2/V3/V4 → compactação V6/V8 → staging D1 → planejamento/reconciliação → promoção/transação atômica → D1`

Havia ainda:

- consulta de conteúdo já conhecido para evitar trabalho repetido;
- bootstrap de fonte lógica e catálogo;
- materialização de resultados importados;
- leitura compartilhada/cache para reduzir custo;
- staging para contornar limites práticos de payload/parâmetros;
- promoção final atômica;
- estados explícitos de conflito, revisão, autorização e confirmação.

## Principais aprendizados

1. **Payload compacto é decisivo.** A mudança para V6/V8 reduziu transporte e pressão sobre o backend.
2. **Staging resolve limites físicos, mas aumenta arquitetura.** Funcionou bem para D1, porém trouxe sessões, promoção, baseline e caminhos adicionais de recuperação.
3. **Planejar antes de aplicar foi valioso.** Separar leitura/reconciliação de escrita permitiu CAS, idempotência e diagnóstico.
4. **Atomicidade final importa mais que microescritas.** A promoção final preservava o arquivo como unidade lógica.
5. **Erro de leitura não é zero.** A distinção de valor indisponível nasceu neste caminho e foi mantida no modelo atual.
6. **Histórico deve representar mudança real.** Reimportação idêntica não deve criar fato novo.
7. **Código de compatibilidade acumula rápido.** V2→V8 mostrou que manter múltiplos transportes e rotas em runtime aumenta custo de entendimento mesmo quando já não são usados.

Veja também [`../../D1-IMPORTACAO-V8.md`](../../D1-IMPORTACAO-V8.md) para o resumo histórico anterior.

## Conteúdo

`codigo/` replica os caminhos originais dos fontes removidos do runtime. `testes/` replica suítes históricas removidas da execução ativa.

Os contratos compartilhados V1–V8 não foram todos removidos de `shared/` porque algumas estruturas ainda são referenciadas por planejadores/auditoria que continuam ativos. O método executável D1, entretanto, foi retirado: clients, rotas, serviços de persistência/staging e promoção não permanecem ligados à aplicação atual.

## Reuso

Use este código como referência, não como módulo. Antes de recuperar qualquer peça, confirme se o problema atual ainda exige staging/D1; o importador relacional atual eliminou várias dessas camadas porque PostgreSQL suporta melhor a carga de importação e a transação por arquivo.
