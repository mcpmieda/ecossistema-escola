# Recuperação paralela — #844 / BN-DEC-033

## Regra e precedência

Pedido do responsável em 17/09/2026 às 23:12 UTC e execução autorizada às 23:14 UTC, após explicitação da composição aditiva nesta conversa. Base lida: `main@8376682e1582a7563999b25f6dea3e64c73f39ab`.

Defina Q = AV1 + AV2, L = qualitativo e P = PARA. Notas ausentes contribuem zero somente à soma; não são convertidas em lançamentos zero. A elegibilidade independe da presença de nota em uma ou ambas as avaliações. Definições estruturais de AV1/AV2 ainda precisam existir; não há máximo inventado.

| Trimestre | Máximo quantitativo | Limite quantitativo (60%) | Máximo total | Limite total (60%) |
| --- | ---: | ---: | ---: | ---: |
| T1 / T2 | 13,5 | 8,1 | 30 | 18 |
| T3 | 18 | 10,8 | 40 | 24 |

É elegível somente quando **Q está abaixo do limite quantitativo E Q + L está abaixo do limite total**. Comparar valores exatos em milésimos antes de qualquer arredondamento e antes de aplicar P. Igualdade com qualquer limite dispensa a paralela. A soma dos máximos configurados continua disponível para diagnóstico, mas não redefine esses limites institucionais.

Quando elegível e P > Q, **quantitativo considerado = Q + P** e **total bruto = Q + P + L**. P entra uma única vez. Caso contrário, quantitativo considerado = Q e total bruto = Q + L. Esta é a composição explicitada e aprovada na conversa e substitui a antiga substituição do quantitativo por P no núcleo ativo. Uma PARA vazia, igual ou menor não reduz nem melhora a soma. O ganho não pode tornar retroativamente o aluno inelegível.

Exemplo exclusivamente sintético: Q = 0,2 (uma avaliação ausente), L = 12 e P = 7 em T2. O total anterior é 12,2 e permanece abaixo de 18; P supera Q; soma bruta = 19,2 e nota arredondada = 19. Não é um registro acadêmico real.

## Núcleo, cobertura e consumidores

`resolveSimplifiedTermV1` permanece a única implementação da regra. `rawMilli` contém a soma exata e `roundedMilli` mantém a função homologada: fração abaixo de 0,300 desce ao inteiro; de 0,300 até antes de 0,750 vai a 0,5; a partir de 0,750 vai ao próximo inteiro. A #844 não muda essa função.

A falta de notas regulares não impede elegibilidade, mas continua registrada na cobertura. Ausências permanecem em `missingSlots`, sem fabricar completude, aprovação anual, nota zero ou estado de fonte. Uma PARA elegível pode melhorar um resultado parcial. Se somente P foi lançada e aplicada, Resultado e Quantitativo precisam expor os pontos calculados, ainda parciais. Um período inteiramente vazio continua sem resultado na apresentação, mesmo sendo elegível em tese.

**Atualização #848 / BN-DEC-034:** a PARA existente e elegível passa a integrar os instrumentos exigíveis da cobertura. Nota zero ou outro número resolve o instrumento; valor ausente mantém a pendência. PARA dispensada não aparece na lista individual nem causa asterisco. Não fez exige vazio observado; zero real aparece como Tirou zero. Outros instrumentos pendentes não são resolvidos por essa alteração. Essa decisão substitui a antiga exclusão incondicional da PARA de `requiredSlots`, sem alterar a soma ou o arredondamento acima. Mapa de consumidores, edição aprovada do Portal e regressões em [PARALLEL_VISIBILITY_848.md](PARALLEL_VISIBILITY_848.md).

Matriz, análise de composição, Conselho e projeções de Boletim reutilizam o mesmo motor. REC final, N/C, R/R, decisões humanas, importador, fatos oficiais AM/U, históricos e snapshots emitidos não são alterados. A referência importada não é sobrescrita pelo cálculo. Não há DML/DDL produtivo, backfill, reimportação ou republicação forçada do Portal.

## Soma exata no contrato e apresentação atual

O detalhe V2 aceita `includeRawSum: true`. Somente a resposta solicitada inclui `regular.rawMilli`, quando já há resultado numérico completo/parcial. O campo vem diretamente do núcleo no mesmo snapshot e não acrescenta consulta. Clientes antigos, matriz, analytics e respostas sem opt-in mantêm o formato anterior.

O cliente atual solicita o opt-in apenas para `cell-detail`. Na #844, `GradeValue` também exibia a soma antes do arredondamento quando diferente. Por determinação posterior do responsável em 18/09/2026, 00:10 UTC, registrada na **#846**, essa explicação foi retirada: a apresentação mantém somente a nota, a cor e o estado, sem texto substituto ou tooltip. Esta determinação substitui exclusivamente a opção de exibição textual mencionada na BN-DEC-033; `rawMilli`, contratos, elegibilidade, composição e arredondamento permanecem intactos. A UI não soma avaliações nem implementa elegibilidade ou arredondamento. Campos extras inválidos e soma associada a estado sem valor continuam recusados pelo contrato.

A orientação transversal de textos essenciais está em `AGENTS.md`: correções e novas implantações de todo o Ecossistema não acrescentam comentários explicativos às telas salvo necessidade operacional ou de segurança. Documentação técnica e mensagens essenciais de estado, erro, conflito e confirmação permanecem separadas.

## Regressões e verificação

- `engine/simplified/parallel-recovery-844.test.ts`: ausência de AV1/AV2/ambas, zero, limites estritos dos três trimestres, total antes da PARA, superior/igual/inferior/vazia, máximos institucionais, aritmética decimal, arredondamento e fatos imutáveis.
- `performance/parallel-recovery-844.test.ts`: leitura SQL em snapshot, matriz/detalhe/lente quantitativa, opt-in compatível, somente PARA, período vazio, preservação da fonte e do NULL observado, seis instruções e nenhuma escrita pelo leitor.
- `performance-ui/parallel-recovery-844-ui.test.ts`: desde a #846, nota sem explicação de arredondamento, estado Parcial, marcador acessível, zero real, estados essenciais, resposta antiga, matriz compacta, opt-in do cliente e falha de autorização preservada.
- Regressões anteriores são atualizadas apenas onde afirmavam a regra substituída; gates de REC, arredondamento, isolamento, autorização, limites e persistência permanecem.

`npm run verify`, testes PostgreSQL/isolamento, revisão, HEAD final, merge e deploy devem constar no checkpoint da issue/PR. Presença deste documento ou de um teste não comprova sua execução. Smoke visual/autenticado, quando indisponível, deve ser explicitamente separado da validação de CI e do deploy.
