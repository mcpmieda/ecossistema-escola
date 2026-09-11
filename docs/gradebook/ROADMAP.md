# Roadmap — quatro fases finais

A reconstrução de persistência da #613 terminou. Este roadmap substitui a fila antiga de cinco etapas, não apaga evidências anteriores. Programa #182; entrega corrente #668 sob FINAL-2/#406/#596, sem reconstruir os blocos já integrados.

## FINAL-1 — #633: runtime relacional e verdade documental

**Entregar:** fonte única documentada, baseline SQL mínima reproduzível, leitura compartilhada em lote e consumidores coerentes com fatos/motor relacionais. Identificar cada rota, fábrica, SQL, contrato e lacuna no `CONSUMER_MAP.md`. Não classificar legado só pelo nome.

**Primeira entrega / PR #636:** reancoragem documental e leitura em lote; projeção anual deixa de consultar fatos separadamente por oferta. Preserva motor e resultados. Não liga novas telas nem fecha toda a fase.

**Blocos integrados/em execução:** baseline, Centrais, Desempenho, Conselho, Boletins, Relatórios, Auditoria atual V2, configuração docente, recuperação/contenção local #662/#663 e retirada Audit V1 #664/#665 estão integrados. A #666 retira clusters frontend antigos sem montagem, preservando os endpoints e serviços de compatibilidade externa. **Restante:** contrato/durabilidade da trilha humana de Auditoria, recuperação operacional externa e validação visual. Remoção de endpoint exige inventário próprio de consumidores; contratos compartilhados exigem issue própria.

**Fechar quando:** consumidores contemplados estejam integrados e verificados, sem relações antigas no caminho migrado, com CI e evidência funcional após publicação autorizada.

## FINAL-2 — #634: Desempenho completo

Implementar o contrato `PAINEL DESEMPENHO`: contexto fixo 2026; turma/período T1–T3/Visão geral; Regular/Recuperação; matriz dominante Nº/Situação/Aluno/componentes; quatro lentes; poucos KPIs e um gráfico contextual; investigação; comparação proporcional T2→T1 e T3→T1/T2 declarada pela #649; detalhes sob demanda. Não criar ou comparar anos letivos. Dados exibidos não são automaticamente população elegível de indicadores. Não criar regras, conceitos qualitativos ou métricas sem semântica sustentada.

Validar legibilidade, acessibilidade, teclado, estados vazios/zero/indisponíveis, descarte de respostas obsoletas e ausência de N+1. A #668 mediu no browser autenticado o payload, p95 de dashboard/detalhe e matriz utilizável e aprovou as metas no cenário sanitizado; isso não vira SLA universal. Validação visual/acessibilidade manual conjunta permanece explícita.

## FINAL-3 — #635: Conselho definitivo

A decisão #648 fixa 2026, os estados 1/2/3, voto opcional somente favoráveis/contrários e desempate do diretor fora do sistema. O V3 relacional entrega turma/aluno, fila, panorama/detalhes, não elegíveis com motivos, sessão, decisão humana, votação, histórico, fechamento e reabertura justificada. Não converte julgamento humano em cálculo nem infere diretor a partir de papel administrativo.

A extensão mínima persiste sessão, idempotência, votos, históricos e fotografias de fechamento sem backfill ou mudança de fatos acadêmicos. CI, migration/postflight, publicação e smoke da #648/#653 estão verdes; a #662 comprovou restart/restauração e contenção CAS em PostgreSQL local. Aceite visual conjunto e piloto permanecem gates separados.

## FINAL-4 — #406: piloto do produto inteiro

Reutilizar evidência da #613; testar o que é novo/regressão e todas as jornadas reais: importação/Auditoria, contexto/pesquisa/centrais, Desempenho, Conselho, emissão/reimpressão e Relatórios. Incluir autorização, no-store, falhas, concorrência, recuperação e medidas de capacidade. Arquivar apenas legado sem consumidores, sem excluir recurso produtivo automaticamente.

**Fechar quando:** matriz sanitizada requisito/caso/resultado/commit verde, divergências materiais reconciliadas e recuperação comprovada. Código/testes sintéticos não substituem esse piloto.

## Aceite e entrega

#347 mantém o aceite acadêmico explícito por consumidor/escopo, versão/vigência e efeito sobre emissões futuras. Não é uma segunda migração física e não cria um flip global obrigatório. #596 encerra operação, runbook, recuperação e aceite institucional. #220 é expansão transversal de observabilidade; falhas críticas bloqueiam, recursos extras planejados não.

## Continuidade histórica

F0–F9 e ondas anteriores continuam registradas em [roadmap preservado](history/pre-final-1/ROADMAP.md). #185/#192 foram substituídas como filas; integridade, durabilidade, segurança e recuperação foram transferidas, não dispensadas. F1 = 7/7 permanece evidência histórica, não prova de todos os painéis no schema novo.

Uma entrega termina somente após testes, integração/publicação autorizadas e verificação aplicável. Não reduzir artificialmente o restante a um percentual de conclusão sem critérios mensuráveis.
