# Decisões oficiais do Banco de Notas

Este é o índice cronológico normativo. A primeira decisão oficial prevalece, salvo substituição expressa. Arquivamento documental não revoga regra por si só.

## BN-DEC-001–021 — texto integral preservado

As decisões de 31/08 a 08/09/2026 estão, sem alteração de conteúdo, em [`history/pre-final-1/DECISIONS.md`](history/pre-final-1/DECISIONS.md), blob de origem `32c4b5126563c72593a0f368d80431332bda642d`.

Permanecem particularmente aplicáveis BN-DEC-002 (shell/HeroUI), BN-DEC-005 (arquivos reais), BN-DEC-008 (regra única), BN-DEC-010 (Desempenho read-only), BN-DEC-014 (privacidade), BN-DEC-019/020 (separação de autoridade e decisões humanas) e BN-DEC-021 (PostgreSQL via Hyperdrive), observadas as substituições abaixo.

## BN-DEC-022 — Consolidação relacional e programa final

**Data:** 2026-09-10. **Origem:** decisões e homologações da #613; #625/#627/#629 e PRs #626/#628/#630; arquivamento #631/#632; programa final autorizado e registrado em #182/#633/#634/#635/#406/#347/#596.

Esta decisão consolida mudanças já aprovadas e define sua precedência documental. Não aplica DDL, não ativa endpoints, não muda dados ou autoridade por sua publicação.

### Substituições expressas

**Substitui BN-DEC-021**, exclusivamente no roteiro executável da migração física e na suposição de equivalência do modelo `streams/versions`: a #613 reconstruiu e homologou o schema relacional simplificado como autoridade de persistência. A sequência antiga de backfill/shadow não será reexecutada nem seu schema recriado. PostgreSQL/Supabase via Hyperdrive `PROD_DB`, backend autorizado, privacidade, menor privilégio e recuperação continuam obrigatórios. D1 antigo não é automaticamente backup das novas escritas.

**Substitui BN-DEC-017**, apenas quanto à representação física de versões: estado atual em tabelas relacionais e histórico de deltas reais, sem exigir streams/versions nem duplicação integral de payloads. Identidade lógica, detecção de alteração semântica, atomicidade e idempotência continuam. Reimportação idêntica não gera DML/histórico acadêmico; pode atualizar diagnósticos operacionais, que são outro conjunto de dados.

**Substitui BN-DEC-006 e a obrigação de retenção de ocorrências de BN-DEC-019**, somente para diagnósticos de importação conforme #629: manter evidências atuais da última leitura do arquivo/ano; apagar as resolvidas ao substituir esse conjunto; adicionar as novas ou ainda presentes. Não existe histórico de resolvidos. Essa exceção não apaga histórico acadêmico, deliberações humanas nem registros oficiais emitidos, e nunca permite alterar a planilha original.

**Complementa BN-DEC-007/019/020**: o motor simplificado e suas projeções existem; o cutover de persistência não prova aceite acadêmico de todos os consumidores. A #347 deixa de ser uma repetição da migração física e mantém a aprovação por consumidor/escopo, versão/vigência e recuperação, com evidências do piloto #406. Não são autorizados flip global, reinterpretação retroativa, escolha de autoridade pelo browser ou eliminação automática de AM/U.

**Atualiza o sequenciamento de BN-DEC-011/012** para quatro entregas grandes: FINAL-1 #633, FINAL-2 #634, FINAL-3 #635, FINAL-4 #406; aceite #347 e entrega #596. Issue/branch/PR, contratos explícitos, revisão e integração autorizada permanecem. PR parcial não encerra a fase inteira.

### Modelo e semântica consolidados

A Relação é o cadastro mestre anual. Pessoa e vínculo são separados; número não é reutilizado naquele vínculo. Oferta tem identidade ano/turma/disciplina/professor; slot identifica instrumento, não sua descrição. Armazenar fatos em inteiros de milésimos; não persistir somas derivadas. `0,1` de fonte é zero acadêmico; zero manual/de fórmula e branco têm semântica de vazio. Limpeza em escopo completo remove o valor atual com histórico; indisponibilidade não inventa zero nem apaga anterior. `N/C` é exclusivo da REC e permanece distinto de valor numérico. Descrição vazia preserva a anterior. Valor acima do máximo é aviso conforme revisão posterior da #613, não bloqueio pela redação inicial superada do corpo da issue.

`fechamento.am*_fonte` e `u_fonte` são referências independentes de comparação. REC é fato permanente; substitui a nota normal somente no cálculo correspondente. Decisão humana de Conselho não é fórmula. Todos os detalhes acadêmicos permanecem definidos pelo núcleo/contratos e decisões da #613, não por esta síntese documental.

São 19 tabelas centrais e uma de diagnósticos. Uma lacuna institucional real de persistência exige proposta mínima e contrato explícito; o número 19 não é motivo para omitir voto/fechamento/snapshot nem para reconstruir o modelo antigo inteiro.

### Fontes funcionais e lacunas

O documento `PAINEL DESEMPENHO` de 29/08/2026 é a referência funcional de Desempenho. Do documento antigo `APENAS CONSELHO` de 23/08/2026, somente o conteúdo de Conselho é preservado como referência funcional. O restante não governa novamente importação, persistência ou Auditoria.

Há diferenças entre o Conselho documental, os códigos atuais de decisão e o contrato institucional V2 antigo. Distinção entre reprovações, voto opcional/desempate, edição/reabertura e fechamento exigem conciliação explícita na #635 por issue de contrato. Não inferir equivalência entre estados diferentes, diretor a partir de administrador nem fatos históricos inexistentes.

### Critério de verdade

Distinguir: fonte normativa, implementação na branch, código integrado, publicação, uso produtivo e homologação. `PROJECT_STATE.yaml` registra a baseline auditada, não flags produtivas inferidas. O mapa de consumidores é um diagnóstico estático dos caminhos, não um teste HTTP autenticado. Testes históricos leem documentos históricos; testes atuais não exigem que a documentação continue descrevendo D1 canônico ou produção OFF.

## BN-DEC-023 — Integração e deploy das entregas concluídas

**Data:** 2026-09-10, 12:31 UTC. **Origem:** autorização explícita do responsável na conversa; registro na #182, comentário `5618750384`. Inclui a remediação de dependências #637.

**Substitui a exigência de confirmação individual de merge/deploy** dos roteiros anteriores, inclusive das #633/#639 e PRs #636/#640, para as entregas do escopo de desenvolvimento aprovado neste repositório. Concluir, revisar, integrar e publicar **sem nova confirmação por PR**. A autorização permanece até revogação ou alteração do escopo pelo responsável.

O fluxo continua: issue e contrato quando necessário → branch curta → revisão do diff → `npm run verify`/CI no head final → merge com SHA esperado → deploy pelo workflow oficial → verificação/checkpoint. Falhas de validação, conflitos ou regressões materiais interrompem a publicação. Não contornar checks, aprovações exigidas pela proteção ou limites de autorização; não habilitar merge incondicional nem criar orquestrador permanente.

Não amplia autorização para apagar dados/recursos, executar migrations destrutivas, alterar regras ou autoridade acadêmica, ACL/RLS, pessoas/permissões, secrets, proteções de branches ou infraestrutura. Essas decisões continuam próprias. Deploy aprovado não é aceite acadêmico #347, piloto #406, teste de restore ou smoke autenticado/visual: registrar evidência e limitação separadamente. PR parcial não encerra FINAL-1.

## BN-DEC-024 — Ano letivo 2026 fixo e comparação somente entre trimestres

**Data:** 2026-09-10. **Origem:** decisão explícita do responsável; #649 e PR #650. Complementa BN-DEC-022/023 e substitui os planos correntes de criação/seleção de anos e de comparabilidade ainda não decidida em #633/#634/#646.

O produto ativo fica restrito ao ano letivo **2026** nesta etapa. Remover criação/gestão de anos, seletor global, catálogo usado para escolha, preferência no browser e qualquer comparação entre anos letivos. Centrais relacionais, Desempenho e importação canônica recusam outro ano antes de ler ou persistir. `ano`/`ano_letivo` permanecem como chaves estruturais, FKs e isolamento; não apagar schema/histórico nem executar mudanças de dados produtivos. A materialização técnica do único registro 2026 pela importação da Relação continua permitida quando necessária às FKs do mesmo fluxo, sem abrir criação de outro ano.

Comparações são apenas entre trimestres de 2026: T2→T1 e T3→T1 ou T2, com referência escolhida explicitamente. Comparar o mesmo aluno, turma, componente, lente e modo pela proporção `valor/máximo oficial positivo`; relação exata maior/igual/menor e diferença em pontos percentuais. Zero participa e valores acima de 100% não são limitados. Resultado, Quantitativo e Qualitativo são elegíveis; Avaliações por slot, T1 e Visão geral não são.

Leitura excluída, parcial, vazia, N/C, recuperação pendente, não aplicável, indisponível ou sem máximo positivo não recebe comparação. Não criar tolerância, tendência, ranking, equivalência de instrumentos, melhora/piora pedagógica ou nova regra acadêmica. A autoridade é observação descritiva sobre a projeção calculada, nunca emissão oficial.

Atual e referência devem nascer do mesmo snapshot PostgreSQL read-only/repeatable-read e do mesmo conjunto de fatos, sem N+1. Seleções ficam em memória e respostas obsoletas são canceladas/descartadas. Os registros atuais do banco podem servir como massa de teste, mas não como dados oficiais ou aceite institucional. A validação visual de FINAL-1/FINAL-2 será única e feita depois com o responsável; avisá-lo imediatamente antes de iniciá-la.

## BN-DEC-025 — Configuração docente vem da fonte e ordem curricular é única

**Data:** 2026-09-11. **Origem:** continuidade autônoma autorizada pelo responsável; #660. Complementa BN-DEC-022/024 e encerra a adaptação pendente da manutenção docente em #633.

Professor, componente e oferta de 2026 são reconhecidos e materializados pelas planilhas importadas. Não criar cadastro manual paralelo, nomes alternativos, confirmação, vigência ou versões ausentes do schema simplificado. A Central de professor é a configuração docente relacional: consulta as ofertas reconhecidas e orienta correções pela fonte/importação. O transporte `maintenanceVersion: 1`, próprio do modelo antigo, deixa de ser servido antes de instanciar aquele runtime; os arquivos exclusivos sem consumidor foram retirados após prova estática de dependência, preservados pelo histórico Git.

A ordem de apresentação dos componentes é a observada em `CONFIGURAÇÃO`/`CONFIGURAÇÕES!H3:I16`: P, M, H, G, C, A, RL, RD, F, ET, I e CT. Desempenho, Boletins, resultados anuais e Centrais usam a mesma função. Componente desconhecido fica depois, em ordem estável, sem sigla/posição inventada. Ordem não integra a identidade acadêmica e não autoriza arraste manual de colunas.

Esta decisão não altera importador, dados/schema de produção, cálculo, regras ou autoridade oficial. Uma futura edição cadastral dentro da aplicação exigiria contrato, durabilidade e decisão próprios; não pode reaproveitar silenciosamente o modelo V1.

## BN-DEC-026 — Trilha humana mínima sem resolução manual de achado

**Data:** 2026-09-11. **Origem:** decisão final da #613 sobre achado corrente × histórico de tratamento; autonomia de produto delegada pelo responsável; contrato #674. Complementa BN-DEC-022 e substitui apenas a lacuna declarada pela #658.

A Auditoria mantém duas verdades independentes. `importacao_diagnostico` continua sendo o snapshot substituível das pendências atuais. A trilha humana é append-only e oferece somente `RECONHECIDO` e `ANOTAÇÃO`. Não criar estado ou botão manual `RESOLVIDO`, `IGNORADO` ou `DESCARTADO`: o achado sai das pendências apenas quando a fonte é corrigida e reimportada. A ação humana nunca altera fato acadêmico nem oculta diagnóstico.

O histórico preserva contexto mínimo sem duplicar o nome do aluno; ator é o OID UUID da sessão, horário é server-side e comandos são idempotentes. Ano fixo 2026, endpoint administrativo/no-store e ACL privada de `SELECT, INSERT`, sem `UPDATE/DELETE` ou acesso público/cliente.

Esta decisão autoriza contrato e implementação em branch/PR. **Não autoriza aplicar o DDL em produção**: a migration aditiva e o código dependente aguardam a autorização explícita de schema preservada pelo responsável.

## BN-DEC-027 — Autorização e aplicação da trilha humana da Auditoria

**Data:** 2026-09-11. **Origem:** autorização explícita do responsável após a PR #675 ficar verde. Complementa BN-DEC-026 e encerra exclusivamente seu gate de DDL.

Fica autorizada a migration aditiva `0006_import_diagnostic_treatment_v1.sql` em produção e a integração/publicação do código dependente após os gates da BN-DEC-023. A autorização não alcança outro schema, backfill, mudança de dado acadêmico, resolução manual de achado, regra, autoridade, binding, segredo, permissão de pessoa ou infraestrutura.

Antes do DDL foi capturado um dump lógico privado e seu restore foi comprovado em PostgreSQL descartável. O preflight confirmou a baseline `29/227/203/62/51`, 12 sequências, somente 2026 e alvo ausente. A migration registrada `import_diagnostic_treatment_v1` levou o catálogo a `30/246/218/66/52` e 13 sequências; a relação nasceu vazia, com ACL `SELECT, INSERT` somente para `gradebook_app`, sem `UPDATE/DELETE` nem acesso de `PUBLIC`, `anon` ou `authenticated`. Funções, triggers e contagens acadêmicas permaneceram iguais. O Advisor de segurança terminou sem alertas; avisos de índice não utilizado na relação vazia são esperados antes do primeiro uso.

## BN-DEC-028 — Anos materializados pela Relação e reprovação terminal R/R

**Data:** 2026-09-11. **Origem:** decisão explícita do responsável; contrato #676. Substitui BN-DEC-024 somente quanto ao ano fixo e à ausência de seleção global; complementa BN-DEC-022/025–027. Comparação entre anos continua proibida.

A importação da Relação materializa idempotentemente o ano letivo declarado. Planilhas de notas somente ingressam depois da Relação do mesmo ano e nunca são reinterpretadas em outro ano. Aluno, vínculo, turma, oferta, fatos, diagnósticos, Conselho, fechamento, boletim e relatório permanecem isolados por `ano`; a mesma pessoa nominal em anos diferentes recebe IDs distintos e não é unida pelo nome.

O shell oferece um único seletor global, alimentado pelos anos já materializados e mantido somente em memória. O ano mais recente abre por padrão. Trocar o ano invalida leituras anteriores e todas as áreas passam a operar no novo contexto sem seletores locais. Comparações continuam restritas a trimestres do mesmo ano, conforme a regra proporcional da BN-DEC-024.

`R/R` é um marcador de fonte exclusivo da Recuperação e distinto de nota, vazio e `N/C`. Se aparecer em qualquer trimestre de recuperação de qualquer componente, o resultado anual do aluno é exatamente `REPROVADO`, sem recuperação pendente e sem elegibilidade ao Conselho. A ocorrência é preservada em máscara própria e histórico de fechamento; não é convertida em voto nem decisão humana. AM/U importadas continuam autoridade oficial e o Conselho continua humano somente para elegíveis.

A migration `0007_multiyear_rr_v1.sql` é aditiva: acrescenta a máscara R/R, amplia os estados históricos e remove apenas as duas restrições físicas que fixavam snapshots/tratamentos em 2026. Não executa backfill, `UPDATE`, `DELETE` ou reinterpretação retroativa. Detalhes em [MULTIYEAR_RR_676.md](MULTIYEAR_RR_676.md).

## BN-DEC-029 — Aplicação da extensão multi-ano/R/R sem backup gerenciado

**Data:** 2026-09-11. **Origem:** autorização explícita do responsável na #676 e decisão de adiar backup gerenciado. Complementa BN-DEC-028 e encerra exclusivamente o gate de DDL da `0007`.

A migration `0007_multiyear_rr_v1.sql` foi aplicada em produção como `multiyear_rr_v1`, versão `20260911201622`, depois de replay PostgreSQL descartável e preflight exato. A operação não criou backup gerenciado por decisão consciente do responsável; essa limitação permanece fora do aceite de recuperação operacional e não autoriza presumir RPO/RTO.

O preflight confirmou catálogo `30/246/218/66/52`, 13 sequências, somente 2026 materializado, coluna alvo ausente e as oito constraints históricas esperadas. O postflight confirmou `30/247/221/66/52`, 13 sequências, 4 funções e 3 triggers; todas as contagens acadêmicas permaneceram idênticas, os 4.463 fechamentos existentes ficaram com `rec_rr_mask = 0`, nenhuma máscara R/R foi inventada e nenhuma constraint obsoleta permaneceu. O Advisor de segurança terminou sem alertas.

## BN-DEC-030 — Configurações, reset anual e vínculo Em curso

**Data:** 2026-09-12. **Origem:** solicitação explícita do responsável; contrato #688. Complementa BN-DEC-022/023/026/028/029 e cria uma exceção deliberada de retenção somente para o reset anual confirmado.

O Banco de Notas passa a ter a área **Configurações**. Sua primeira operação administrativa é `Resetar o sistema`: limpar integralmente um único ano letivo materializado, escolhido pelo seletor global, para permitir novo lançamento a partir das planilhas. Não existe reset global, reset de sequências, `DROP`, `TRUNCATE`, reconstrução de schema ou efeito sobre outro ano.

O reset anual é uma ação excepcional e explícita. Prévia somente leitura enumera as contagens; execução exige a frase exata `RESETAR <ano>`, confirmação de irreversibilidade e a mesma revisão da prévia. O servidor autentica a capability administrativa, confere origem/provider/gate e executa o conjunto em transação serializável com bloqueio. Mudança desde a prévia, ano ausente ou qualquer falha encerram sem exclusão parcial.

Para esse comando confirmado, “tudo referente ao ano” inclui cadastro anual, vínculos, ofertas, instrumentos, notas, fechamentos, importações, diagnósticos e tratamentos, deliberações/fotografias do Conselho, boletins emitidos e históricos atribuíveis ao ano. Esta decisão substitui a retenção append-only da BN-DEC-022/026 **somente durante esse reset anual deliberado**. Diagnóstico sem ano permanece porque não pode ser atribuído com segurança. Ao final, o próprio registro `ano_letivo` é removvido; o ano só volta ao catálogo quando uma Relação o materializa novamente.

A migration `0008_year_reset_acl_v1.sql` autoriza somente `DELETE` nas dez relações posteriores que tinham ACL append-only; não concede `ALL`, `TRUNCATE`, DDL, acesso público/cliente ou permissão a usuário. A aplicação/publicação da ACL fica autorizada como parte da entrega #688 sob os gates da BN-DEC-023. Isso não autoriza executar um reset produtivo durante desenvolvimento, deploy ou smoke; cada execução continua dependendo da confirmação final do operador na própria interface. A ausência de backup gerenciado deve permanecer visível e não pode ser apresentada como resolvida.

Na matriz de Desempenho, `vinculo.situacao = NULL` significa vínculo regular vigente e é apresentado como **Em curso**. É rótulo de interface derivado da Relação, não nova situação persistida nem resultado acadêmico. A limpeza de código permanece seletiva: não adicionar fallback legado e não remover contratos ainda consumidos apenas por semelhança de nome.

A ACL foi aplicada em produção como `year_reset_acl_v1`, versão `20260912004843`, sem DML. O preflight confirmou as dez relações alvo, os dois anos materializados e ausência de `DELETE`; o postflight preservou integralmente as contagens anuais e o catálogo `30/247/221/66/52`, com 13 sequências, 4 funções e 3 triggers. `gradebook_app` recebeu somente `DELETE` adicional nessas relações, `PUBLIC`/`anon`/`authenticated` permaneceram sem grants e o Advisor de segurança terminou sem alertas. Nenhum reset produtivo foi executado.

## BN-DEC-031 — Observação granular, zero real e nomes de avaliações

**Data:** 2026-09-16. **Origem:** pedido explícito do responsável na conversa; #817 / PR #818. Substitui a semântica zero=vazio da BN-DEC-022 exclusivamente nos intervalos granulares AV1/AV2/PARA/atividades 1–10 do novo produtor canônico identificado.

Célula efetivamente lida em branco significa atividade não realizada; zero digitado ou resultado numérico zero de fórmula significa zero acadêmico. Indisponível, instrumento inativo e fonte ainda não observada não significam “Não fez”. O marcador legado 0,1 continua zero; AM/REC/U não recebem a nova conversão. Linha atual com nota NULL e flags históricos registram a observação sem reconstruir fatos antigos descartados. O produtor sem a nova identificação preserva compatibilidade. Não há backfill automático; reimportação é necessária quando a informação anterior foi perdida.

A interface granular do Banco e do Portal apresenta “Não fez” e “Tirou zero”, sem substituir a nota trimestral, a autoridade imported-source ou decisões humanas. O cadastro Nomear avaliações define seis nomes por ano/trimestre/AV1–2, com CAS, coordenação e evento transacional. Os nomes são apresentação, nunca identidade nem nova fórmula; podem atualizar rótulos já publicados sem trocar os resultados. Boletins emitidos mantêm seu snapshot. Autosave de nascimento continua sendo uma escrita autorizada, validada e rastreável; simplificação visual não elimina as confirmações de operações críticas.

A entrega inclui as migrações aditivas mínimas descritas em [STUDENT_EXPERIENCE_817.md](STUDENT_EXPERIENCE_817.md), sem reset/reimportação/backfill produtivo durante desenvolvimento. Gates de integração/publicação permanecem BN-DEC-023; DDL e verificação produtiva devem constar separadamente no checkpoint. Não autoriza migração destrutiva, mudança de ACL/identidade/secrets ou alteração de regras acadêmicas fora dos slots explicitamente pedidos.

## BN-DEC-032 — 0,1 como nota decimal comum

**Data:** 2026-09-17, 13:35 UTC. **Origem:** determinação explícita do responsável; contrato #837. Substitui exclusivamente a convenção de marcador 0,1 das BN-DEC-022/031 no caminho ativo de novas importações.

`0,1` é número comum: leitura manual, texto decimal com vírgula/ponto e resultado numérico salvo de fórmula preservam **100 milésimos**, participantes de somas, médias e indicadores conforme seus critérios existentes. Não converter esse valor em zero nem preferir uma normalização antiga ao escalar bruto recém-observado. A nova identificação do produtor inclui `decimal-grades-v1`.

Nos instrumentos granulares, vazio observado permanece “Não fez” e zero real permanece “Tirou zero”, como na BN-DEC-031. Fonte indisponível ou fórmula sem cache não recebem nenhum desses diagnósticos e não apagam o valor anterior. A remoção da sentinela 0,1 também alcança os valores decimais de AM/REC/U, sem modificar os outros estados ou a convenção separada de zero/vazio desses campos. Não altera N/C, R/R, aplicabilidade da recuperação, pesos, máximos, arredondamento final ou autoridade imported-source.

Zeros anteriormente gravados não são convertidos por suposição: é necessária reimportação de uma fonte que ainda contenha 0,1. Históricos, contratos antigos e boletins emitidos permanecem interpretáveis em seu contexto. A atualização do Portal segue as políticas existentes, sem republicação forçada. Não autoriza backfill, DML direto ou mudança de schema em produção. Implementação e regressões em [DECIMAL_GRADES_837.md](DECIMAL_GRADES_837.md); integração e publicação seguem BN-DEC-023, com validação manual no navegador a cargo do usuário.

## BN-DEC-033 — Elegibilidade e composição da recuperação paralela

**Data:** 2026-09-17, 23:12–23:14 UTC. **Origem:** regra e composição explicitadas nesta conversa, seguidas da ordem de execução imediata; contrato #844. Substitui no núcleo ativo a exigência de AV1/AV2 preenchidas e a composição anterior por substituição do quantitativo pela PARA. Não altera o histórico documental nem a REC final.

Q = AV1 + AV2; L = qualitativo. Ausência contribui zero à aritmética, sem converter o fato NULL em nota zero. Elegível somente se Q < 60% de 13,5/13,5/18 E Q + L < 60% de 30/30/40. Usar limites institucionais e total exato anterior à PARA, sem arredondar, sem exigir qualquer das duas notas e sem circularidade. Igualdade com qualquer limite dispensa a paralela. Definições estruturais ausentes continuam indisponíveis; cobertura permanece separada da elegibilidade.

Conforme a composição explicitada e aprovada na conversa, se elegível e PARA > Q, somar PARA uma única vez ao quantitativo original: bruto = Q + PARA + L. Caso contrário, bruto = Q + L. Preservar `rawMilli` e o arredondamento homologado em `roundedMilli`; o detalhe pode apresentar a soma exata pelo opt-in `includeRawSum: true`, sem fórmula na UI nem alteração do formato recebido por clientes antigos. Um benefício registrado não pode ser ocultado apenas porque as avaliações regulares estão ausentes.

Esta mudança alcança o cálculo descritivo corrente, não sobrescreve AM/U importadas, não muda decisões humanas ou snapshots emitidos e não executa DML/DDL, backfill, reimportação ou republicação forçada. Regras, exemplos sintéticos, consumidores e testes em [PARALLEL_RECOVERY_844.md](PARALLEL_RECOVERY_844.md). Gates de integração/publicação continuam BN-DEC-023; CI, deploy e smoke devem ser comprovados separadamente.

## BN-DEC-034 — PARA visível e exigível somente para elegíveis

**Data:** 2026-09-18, 00:45 UTC. **Origem:** determinação explícita do responsável; contrato #848. Complementa BN-DEC-031/033 e substitui a exclusão incondicional da PARA da cobertura de lançamentos. Não modifica os limites, a composição aditiva ou o arredondamento da BN-DEC-033.

Nas listas individuais, a PARA só aparece quando `parallelApplicable === true` no núcleo. Existência de nota, zero ou vazio observado não contorna a elegibilidade. Para elegíveis, vazio observado é “Não fez” e zero numérico é “Tirou zero”; ausência de observação não autoriza inventar “Não fez”. O fato original continua armazenado mesmo quando a linha é ocultada.

A PARA integra `coverage.requiredSlots` somente quando o instrumento existe no trimestre e o aluno é elegível. Valor nulo mantém o instrumento pendente; qualquer valor numérico, inclusive zero e nota sem ganho, resolve esse instrumento. PARA não elegível não cria pendência. Os asteriscos, estado parcial e consumidores de cobertura devem seguir a saída do núcleo; não apagar ausências em outras avaliações/atividades, inventar instrumento inexistente ou transformar período inteiramente vazio em nota zero.

A matriz compartilhada de avaliações pode manter a coluna PARA quando há elegíveis no recorte visível, mas não revela valor ou “Não fez” nas células não elegíveis. Sem elegíveis, a coluna e o resumo de instrumento são omitidos. Resultado, dimensão quantitativa considerada, estatísticas, comparações e novas prévias de Boletim reutilizam a cobertura aplicável, sem fórmula paralela na UI.

O Portal aplica o filtro aos fatos da edição aprovada, sem consultar notas novas para substituir uma publicação anterior. Notas oficiais AM/U, calendário, permissões, opção de parciais, autoUpdate, períodos publicados e snapshots já emitidos são preservados. Não há DML/DDL, reimportação ou republicação forçada nesta entrega. A orientação #846 permanece: não acrescentar comentários explicativos às telas. Mapa de consumidores e regressões em [PARALLEL_VISIBILITY_848.md](PARALLEL_VISIBILITY_848.md); revisão, CI e deploy seguem BN-DEC-023.
