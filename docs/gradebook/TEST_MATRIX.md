# Matriz de testes — Banco de Notas

Todo teste versionado usa dados sintéticos ou anonimizados. Arquivos reais são usados somente em validação controlada fora do repositório e produzem relatórios agregados sem nomes/notas identificáveis.

## SRC — Contrato da fonte

- `SRC-001`: guia D1 reconhecida sem sufixo.
- `SRC-002`: guias D2 e D3 reconhecidas e vinculadas à disciplina correta.
- `SRC-003`: `J1`, `K2`, `K3` e `K4` lidos corretamente.
- `SRC-004`: atividade com nome `*` ou máximo zero não é aplicável.
- `SRC-005`: guia protegida pode ser lida sem remover proteção.
- `SRC-006`: guia oculta/auxiliar é classificada sem virar guia de nota.
- `SRC-007`: nome inesperado gera diagnóstico, não descarte silencioso.
- `SRC-008`: arquivo original não é modificado.

## CELL — Semântica de célula

- `CELL-001`: vazio é ausência, não zero.
- `CELL-002`: `0,1` manual preserva origem e vale zero semanticamente.
- `CELL-003`: zero manual legado permanece zero real.
- `CELL-004`: número positivo manual é lançamento.
- `CELL-005`: número negativo é preservado e auditado.
- `CELL-006`: fórmula não zero conserva fórmula/cache e é válida.
- `CELL-007`: fórmula zero é ausência segundo o contrato vigente.
- `CELL-008`: fórmula sem cache/erro gera ocorrência.
- `CELL-009`: texto inválido não é convertido em nota.
- `CELL-010`: não aplicável, não lançada e campo inexistente são distintos.

## IMP — Importação

- `IMP-001`: 1, 20 e 50 arquivos processados sequencialmente.
- `IMP-002`: lote com mais de 50 é recusado antes da leitura.
- `IMP-003`: falha de um arquivo não cancela os demais.
- `IMP-004`: formatos XLSB, XLSX e XLS são aceitos.
- `IMP-005`: arquivo sem guia de nota gera falha individual explicável.
- `IMP-006`: manifesto registra nome, tamanho, modificação e SHA-256.
- `IMP-007`: reimportação do mesmo hash não duplica lançamentos.
- `IMP-008`: versão alterada preserva histórico do valor anterior.
- `IMP-009`: progresso e resultado por arquivo permanecem coerentes.
- `IMP-010`: nenhum arquivo é enviado/persistido sem ação prevista no fluxo aprovado.

## ID — Identidade, matrícula e transferências

- `ID-001`: posições históricas são preservadas mesmo fora de `J1`.
- `ID-002`: `FOI PARA 6B` + `ESTAVA NO 6A` cria trajetória e uma posição vigente.
- `ID-003`: notas replicadas no destino não duplicam resultado atual.
- `ID-004`: novato com notas anteriores válidas mantém as notas.
- `ID-005`: transferido/desistente/falecido mantém histórico preenchido.
- `ID-006`: ponto inicial e marcas significativas distinguem homônimos.
- `ID-007`: nomes semelhantes não são associados automaticamente entre anos.

## ENG — Motor nativo

- `ENG-001`: máximos trimestrais 30, 30 e 40.
- `ENG-002`: composição 45% quantitativo / 55% qualitativo conforme perfil vigente.
- `ENG-003`: arredondamento em 0,24; 0,25; 0,74; 0,75 e valores negativos.
- `ENG-004`: paralela em 59,9%, 60% e 60,1% do quantitativo.
- `ENG-005`: quantitativo considerado preserva original e aplica a maior paralela conforme regra.
- `ENG-006`: recuperação final substitui o trimestre aplicável mesmo quando menor.
- `ENG-007`: total anual antes e depois da recuperação.
- `ENG-008`: aprovação em 59,9; 60 e 60,1 pontos.
- `ENG-009`: 0, 1, 2 e 3+ componentes não aprovados para elegibilidade ao Conselho.
- `ENG-010`: situação especial/decisão formal respeita a precedência oficial.
- `ENG-011`: resultados parciais e cobertura insuficiente não viram resultado final inventado.
- `ENG-012`: mesma entrada + mesma versão de regra produz saída determinística.

## REC — Recuperação

- `REC-001`: originais `X`, `Y`, `AA` e total `AB` conferem com os trimestres.
- `REC-002`: aplicabilidade `AC`, `AD`, `AE` controla somente o trimestre correspondente.
- `REC-003`: notas `R`, `S`, `T` permanecem separadas dos originais.
- `REC-004`: total pós-REC `U` é conciliável com a regra nativa.
- `REC-005`: ausência de nota REC não é zero.

## AUD — Reconciliação e Auditoria

- `AUD-001`: valor importado igual ao nativo gera `match`.
- `AUD-002`: divergência esperada é identificada e explicada.
- `AUD-003`: divergência real não substitui nenhum valor silenciosamente.
- `AUD-004`: erro crítico impede aparência de sucesso completo.
- `AUD-005`: ocorrência informa arquivo, guia, célula, entidade, regra e ação.
- `AUD-006`: resolução preserva usuário, data, justificativa e estado anterior.
- `AUD-007`: rejeitar um arquivo não perde os demais arquivos válidos do lote.

## UI — HeroUI e experiência funcional

- `UI-001`: Banco usa o mesmo shell/topbar/sidebar/pesquisa/perfil do Centro.
- `UI-002`: usuário leigo entende a tarefa principal sem configurar o sistema primeiro.
- `UI-003`: estados loading, erro, vazio, parcial e concluído são distintos.
- `UI-004`: teclado, foco visível e leitor de tela cobrem ações principais.
- `UI-005`: redução de movimento é respeitada.
- `UI-006`: celular não exige layout de desktop comprimido.
- `UI-007`: cor nunca é o único sinal de significado.
- `UI-008`: nenhuma tela calcula regra acadêmica no componente React.

## PERF — Desempenho

- `PERF-001`: read model inicial contém apenas ano/turma/período/lente.
- `PERF-002`: sem N+1 por aluno ou componente.
- `PERF-003`: matriz prioriza leitura sem overflow quando houver largura.
- `PERF-004`: detalhes são carregados sob demanda e respostas antigas são descartadas.
- `PERF-005`: comparação usa percentual quando máximos diferem.
- `PERF-006`: sinal analítico nunca altera estado acadêmico.
- `PERF-007`: payload e latência são medidos em cenário documentado.

## SEC — Segurança e privacidade

- `SEC-001`: capabilities verificadas no servidor.
- `SEC-002`: busca não revela entidade sem permissão.
- `SEC-003`: respostas acadêmicas usam `Cache-Control: no-store`.
- `SEC-004`: localStorage/sessionStorage/IndexedDB/Cache API não armazenam notas sem decisão explícita vigente.
- `SEC-005`: logs e telemetria não contêm nomes, notas ou payload acadêmico.
- `SEC-006`: nenhuma fixture ou artefato público contém dado real.

## REL — Release

- `REL-001`: `npm run verify` aprovado no SHA do PR.
- `REL-002`: merge somente depois dos critérios de aceite.
- `REL-003`: workflow de produção aprovado no SHA da `main`.
- `REL-004`: rota/fluxo novo verificado no site oficial.
- `REL-005`: issue, fase e `PROJECT_STATE.yaml` atualizados pelo integrador.
- `REL-006`: recurso incompleto não aparece como disponível.
