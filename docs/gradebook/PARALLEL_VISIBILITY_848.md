# Visibilidade e cobertura da PARA — #848 / BN-DEC-034

Pedido do responsável: 18/09/2026, 00:45 UTC. Base: `main@1e29b008501e54e63f54b6c8021d6b027a85466c`. Esta entrega complementa #844 e mantém a orientação de interface da #846.

## Comportamento

| Elegibilidade do núcleo | Fato da PARA | Lista individual | Cobertura da PARA existente |
| --- | --- | --- | --- |
| Elegível | Valor positivo | Mostra nota | Resolvida |
| Elegível | Zero numérico | Tirou zero | Resolvida |
| Elegível | NULL observado | Não fez | Pendente |
| Elegível | Sem observação | Ausência de lançamento, sem inventar Não fez | Pendente |
| Não elegível | Qualquer estado ou valor | Não mostra a linha | Fora dos instrumentos exigíveis |
| Sem definição da PARA | Nenhum instrumento | Não inventa linha | Não inventa obrigação |

A decisão usa somente `parallelApplicable` calculado pelo núcleo. Os dois limites estritos de 60%, a avaliação anterior à PARA, a composição aditiva quando P > Q e o arredondamento da BN-DEC-033 não mudam. Mostrar uma nota não significa aplicá-la: uma PARA elegível igual ou inferior a Q resolve o lançamento, mas não acrescenta ganho.

A elegibilidade continua independente das notas ausentes nas duas avaliações. Cobertura é outra informação: uma PARA **existente e elegível** entra em `requiredSlots`; qualquer número, inclusive zero, entra em `resolvedSlots`; null permanece em `missingSlots`. O asterisco some por causa da PARA somente quando essa pendência é resolvida ou dispensada. Uma AV/atividade ainda ausente continua mantendo o resultado parcial. Um período inteiramente sem valor permanece sem resultado numérico; PARA zero realmente registrada é um valor, não ausência.

## Consumidores

| Caminho | Efeito |
| --- | --- |
| `resolveSimplifiedTermV1` | Única decisão de elegibilidade, pontos e cobertura exigível. |
| `performanceCellV2` e projeção acadêmica relacional | Herda completo/parcial e comparação; matriz, trajetória, anual, Conselho e Relatórios recebem o mesmo estado. Não há estrela decidida no browser. |
| `PerformanceStudentDetailV2` | Retira os OR que revelavam nota/observação mesmo com showParallel falso; mantém os estados granulares já existentes. |
| `performance-analysis-v3.ts` | Quantitativo considerado consulta os slots exigíveis do núcleo; não duplica o máximo da PARA. Avaliações não revelam valor/notDone em célula não elegível e não mantêm coluna sem elegíveis no recorte visível. |
| `performance-analytics-v6.ts` | Cobertura inclui somente PARA exigível. Resumos de instrumento sem elegíveis são omitidos. Estados, comparabilidade e parciais por estudante/docente seguem a matriz central. |
| `relational-bulletin-v2.ts` | Novas prévias/materializações omitem PARA não elegível e recebem cobertura central; leitura/reimpressão de snapshots anteriores permanece inalterada. |
| `AcademicStudentReaderPostgresV1.projectPreparedSourceV2` | Filtra as parciais da mesma edição aprovada pela elegibilidade do núcleo, preservando zero, observado/null e a AM/U oficial. REC e autoridade conservam a completude regular preexistente da edição oficial pelo adaptador privado `officialEditionTermV1`. |
| `scopedSelfV2` → `StudentGradesV1` | O fluxo já projeta a edição aprovada em cada leitura; a tabela recebe a lista filtrada e usa os rótulos granulares existentes. Sem busca de notas atuais, nova publicação ou nova fórmula no React. |

Em matriz de avaliações com alunos elegíveis e dispensados, a coluna comum pode existir para os elegíveis. As células dispensadas ficam neutras, sem nota nem rótulo Não fez/Tirou zero. A operação não apaga o fato armazenado nem o histórico de importação.

## Autoridade e publicação

A AM/U importada continua sendo o resultado oficial do Portal. Não foi acrescentado asterisco derivado localmente ao total oficial do Portal, nem campo HTTP novo; os indicadores existentes de cobertura no Banco e seus consumidores usam o núcleo. REC final, N/C, R/R e decisões humanas preservam suas fórmulas/estados; resultados descritivos correntes que dependem de completude recebem a cobertura corrigida.

O Portal não usa uma nota recém-importada para decidir a visibilidade de uma edição antiga com autoUpdate desligado. `scopedSelfV2` fornece a edição aprovada ao mesmo reader, e o filtro opera somente nos fatos dessa edição. Parciais, calendário, acesso e liberação de períodos continuam sendo limites independentes. Sem evidência estruturada de uma edição legada, não reconstruir elegibilidade usando notas atuais: conservar a semântica histórica e registrar a limitação.

A revisão identificou que aplicar a nova pendência da PARA diretamente à recuperação/autoridade do reader poderia remover REC e a classificação de uma edição já aprovada. A fronteira oficial agora mantém duas visões dos mesmos termos: a saída corrente intacta determina a visibilidade de PARA; uma cópia de cobertura sem slot 3 conserva exclusivamente a completude regular usada anteriormente por REC e `sourceAgrees`. O adaptador não calcula notas, não muda máximos/arredondamento/elegibilidade, não apaga outras pendências e não torna completo o resultado descritivo do Banco. Todos os números e as máscaras REC/N/C/R/R continuam vindo dos mesmos fatos e do mesmo motor. Funciona com edição preparada mesmo sem `previous published_projection`; não depende de um fallback ou de notas atuais.

Conferência produtiva estritamente agregada e somente leitura constatou publicação por escopo ativa e nenhuma publicação legada com revisão sem edição preparada. Isso não é prova visual da sessão de cada estudante. Nenhum DML/DDL, backfill, reimportação, alteração de fonte ou republicação forçada foi executado.

## Regressões e gates

Novos testes usam exclusivamente fatos e identidades sintéticos:

- `performance/parallel-visibility-848.test.ts`: três trimestres, limites, ausência, zero, cobertura/asteriscos, anual, dimensões, estatísticas e colunas de recorte misto/filtrado.
- `performance/parallel-visibility-848-sql.test.ts`: leitores PostgreSQL/PGlite reais com a sequência canônica de migrations, seis instruções por matriz/detalhe/análise, estado/granularidade, fato armazenado preservado e prévia de Boletim sem escrita em snapshots.
- `performance/parallel-visibility-848-ui.test.tsx`: componentes reais Banco/Portal, Não fez/Tirou zero, linha oculta, atualização do mesmo recorte e asterisco vindo do núcleo; nenhum comentário de arredondamento reintroduzido.
- `student-portal/academic/parallel-visibility-848.test.ts`: edição preparada, imutabilidade, nenhuma consulta atual, versão divergente recusada, AM/U preservadas e limites de acesso/calendário/parciais.
- `student-portal/academic/approved-recovery-848.test.ts`: reader real preserva REC numérica, N/C, R/R, pendência REC e autoridade sem resolver a PARA corrente; faltas regulares continuam bloqueando. Exercita `scopedSelfV2` com linhas de edição selecionadas sintéticas, autoUpdate desligado, revisão antiga e sem projeção anterior. Autorização e seleção SQL também continuam cobertas por seus gates de integração existentes.

Expectativas anteriores que descreviam a regra substituída são atualizadas somente com cenários explícitos. Não remover testes, afrouxar limites, forjar completude ou pular validação. Revisão do diff, HEAD, resultado de `npm run verify`, gate PostgreSQL/isolamento e publicação efetiva devem constar na issue/PR. Acesso local ao clone falhou por DNS; execução completa é comprovada pelo CI oficial, não alegada como local. Smoke visual autenticado é evidência separada.

O responsável autorizou ajuda do CodeRabbit exclusivamente nesta alteração em 18/09/2026, 01:44 UTC, conforme comentário na #848. A assistência cobre revisão e correções explicitamente delimitadas neste PR; não autoriza configuração permanente, outros agentes, mudança de dependências/workflows ou ações produtivas do bot. Os commits de assistência são conferidos diretamente antes da integração. Os avisos do ambiente isolado do revisor não substituem os checks do projeto instalado pelo lockfile.
