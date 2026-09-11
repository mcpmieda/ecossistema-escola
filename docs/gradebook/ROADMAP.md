# Roadmap — quatro fases finais

A reconstrução de persistência da #613 terminou. Este roadmap substitui a fila antiga de cinco etapas, não apaga evidências anteriores. Programa #182; entrega corrente #658 sob FINAL-1 #633, sem reconstruir os blocos já integrados.

## FINAL-1 — #633: runtime relacional e verdade documental

**Entregar:** fonte única documentada, baseline SQL mínima reproduzível, leitura compartilhada em lote e consumidores coerentes com fatos/motor relacionais. Identificar cada rota, fábrica, SQL, contrato e lacuna no `CONSUMER_MAP.md`. Não classificar legado só pelo nome.

**Primeira entrega / PR #636:** reancoragem documental e leitura em lote; projeção anual deixa de consultar fatos separadamente por oferta. Preserva motor e resultados. Não liga novas telas nem fecha toda a fase.

**Blocos integrados/em execução:** baseline, Centrais, Desempenho, Conselho, Boletins e Relatórios V2 estão integrados. A #658 retira o Audit Workspace V1 do caminho ativo e apresenta somente diagnósticos relacionais atuais. **Restante depois da #658:** manutenção docente, contrato/durabilidade da trilha humana de Auditoria, isolamento/concorrência/frescor e remoção apenas de dependências comprovadamente mortas. Contratos compartilhados exigem issue própria.

**Fechar quando:** consumidores contemplados estejam integrados e verificados, sem relações antigas no caminho migrado, com CI e evidência funcional após publicação autorizada.

## FINAL-2 — #634: Desempenho completo

Implementar o contrato `PAINEL DESEMPENHO`: contexto fixo 2026; turma/período T1–T3/Visão geral; Regular/Recuperação; matriz dominante Nº/Situação/Aluno/componentes; quatro lentes; poucos KPIs e um gráfico contextual; investigação; comparação proporcional T2→T1 e T3→T1/T2 declarada pela #649; detalhes sob demanda. Não criar ou comparar anos letivos. Dados exibidos não são automaticamente população elegível de indicadores. Não criar regras, conceitos qualitativos ou métricas sem semântica sustentada.

Validar legibilidade, acessibilidade, teclado, estados vazios/zero/indisponíveis, descarte de respostas obsoletas, ausência de N+1 e metas de payload/latência do documento, com cenário explícito. Meta não medida não vira SLA cumprido.

## FINAL-3 — #635: Conselho definitivo

A decisão #648 fixa 2026, os estados 1/2/3, voto opcional somente favoráveis/contrários e desempate do diretor fora do sistema. O V3 relacional entrega turma/aluno, fila, panorama/detalhes, não elegíveis com motivos, sessão, decisão humana, votação, histórico, fechamento e reabertura justificada. Não converte julgamento humano em cálculo nem infere diretor a partir de papel administrativo.

A extensão mínima persiste sessão, idempotência, votos, históricos e fotografias de fechamento sem backfill ou mudança de fatos acadêmicos. FINAL-3 termina após CI, migration/postflight, publicação e smoke da #648/#653; restart/contenção multi-sessão, integração posterior de Boletins/Relatórios e aceite visual conjunto permanecem gates dos blocos que os possuem.

## FINAL-4 — #406: piloto do produto inteiro

Reutilizar evidência da #613; testar o que é novo/regressão e todas as jornadas reais: importação/Auditoria, contexto/pesquisa/centrais, Desempenho, Conselho, emissão/reimpressão e Relatórios. Incluir autorização, no-store, falhas, concorrência, recuperação e medidas de capacidade. Arquivar apenas legado sem consumidores, sem excluir recurso produtivo automaticamente.

**Fechar quando:** matriz sanitizada requisito/caso/resultado/commit verde, divergências materiais reconciliadas e recuperação comprovada. Código/testes sintéticos não substituem esse piloto.

## Aceite e entrega

#347 mantém o aceite acadêmico explícito por consumidor/escopo, versão/vigência e efeito sobre emissões futuras. Não é uma segunda migração física e não cria um flip global obrigatório. #596 encerra operação, runbook, recuperação e aceite institucional. #220 é expansão transversal de observabilidade; falhas críticas bloqueiam, recursos extras planejados não.

## Continuidade histórica

F0–F9 e ondas anteriores continuam registradas em [roadmap preservado](history/pre-final-1/ROADMAP.md). #185/#192 foram substituídas como filas; integridade, durabilidade, segurança e recuperação foram transferidas, não dispensadas. F1 = 7/7 permanece evidência histórica, não prova de todos os painéis no schema novo.

Uma entrega termina somente após testes, integração/publicação autorizadas e verificação aplicável. Não reduzir artificialmente o restante a um percentual de conclusão sem critérios mensuráveis.
