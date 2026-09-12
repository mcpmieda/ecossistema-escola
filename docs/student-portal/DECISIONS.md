# Decisões e pendências

## PA-DEC-001 — Precedência e escopo (12/09/2026)

Especificação v3.0 + Adendo01, com substituições explícitas registradas em MASTER_SPEC. #702 autorizada pelo responsável após planejamento #701; não iniciar #703+ automaticamente. Autoria aqui limita-se aos oito docs e contratos/tests PA. Nenhuma mudança de BN, app, schema, DNS, secret ou deploy manual. Merge sujeito ao AGENTS/verify no head esperado; workflow oficial existente pode publicar automaticamente o commit integrado, sem nova funcionalidade visível.

## PA-DEC-002 — Topologia com DNS externo

Pages Portal mínimo entrega HTTPS mesma origem e encaminha self ao Worker; ADM mantém service binding privado separado. GoDaddy mantém NS. É escolha técnica para preservar requisito dentro do DNS real, sem inventar domínio Worker compatível. Validação de binding/custo é T-01/T-02 em #705; enquanto ausente, implantação bloqueada, autoria independente segue. Usuário autorizou cadastrar endereço real no Edge quando disponível e encerrar browser depois. Não provisionado em #702.

## PA-DEC-003 — Defaults e limites técnicos

Defaults de produto são30d/12h,3 falhas,5 falhas/15 min. Janela15 min, desafio5 min, recibo24h, preview encerramento5 min, lote100/query100/body8KiB auth/64KiB ADM, nascimento1900…2026 são escolhas técnicas revisáveis por contrato versionado, com testes de limite. KDF algoritmo/parâmetros não inventados: seleção e benchmark #711/#714 são bloqueio técnico de ativação, nunca motivo para enfraquecer senha. Date fields RFC3339/fuso SãoPaulo/início inclusivo/fim exclusivo. Calendário/risk são overrides atômicos por campo de topo.

## PA-DEC-004 — Paralelismo visível no título

Pedido do responsável: título explicita SEQUENCIAL/PARALELO e CODEX/CHAT ONLINE. PARALELO é elegibilidade após gate, não licença para ignorar dependência. Primeira onda após #703/G-C: #704 autoria e #705 preparação. Nenhum agente auxiliar iniciado; executor atua diretamente. Estratégia/testes #714 podem ser preparados cedo, mas integração/carga é janela sequencial.

## H/T reconciliados

| Item | Estado | Próxima prova/owner |
|---|---|---|
| H-01 identidade | Resolvido Adendo: BN/2026, sem hash externo | #703 contrato, #707 transações |
| H-02 resultado final | Produto resolvido: toggle/data/oficial e EM CURSO | #703 autoridade, #708/#710/#712 |
| H-03 risco | Defaults e fluxo aceitos; parâmetros técnicos delimitados | #711/#714 KDF/abuso reais |
| H-04 orçamento | B limitada sem novo custo | #705 prova billing/cotas inacessíveis |
| H-05 backup | Pós-entrega, não bloqueiaP1 | #714 integridade/chaves/recovery técnico |
| H-06 autorização | #702 atual; B para futura execução limitada | cada issue explicitamente iniciada; sem fila automática |
| H-07 calendário | Fonte ADM editável resolvida | responsável preenche valores reais, #708API |
| H-08 situações | Mapa Adendo resolvido | #703/#707 validam fonte e locks |
| H-09 anos | Somente2026 resolvido | expansão foraP1 |
| H-10 piloto | 6A teste privado; abertura geral posterior | #715 coordenação privada; G-P posterior |
| T-01 | Parcial: conta/recursos confirmados; billing/DNS Portal pendentes | #705 |
| T-02 | Contratado, sem smoke RPC/TLS real | #705/#713/#715 |
| T-03 | Interfaces prontas, KDF/driver/carga não provados | #705/#711/#714 |
| T-04 | Capabilities inspecionadas; SSO real pendente | #713/#715 |
| T-05 | DTO PA proposto, autoridade BN aguarda #703 | #703/#710 |
| T-06 | Recovery técnico obrigatório, gerenciado adiado | #714 |
| T-07 | HeroUI existente; Pro/leitor/câmera são P2 quando aplicável | fora execução #702 |
| T-08 | Ports definidos; revisionamento/flushV11 não implementados | #703/#707/#712 |
| T-09 | Legado D1 fora Portal | não remover em P1 |

Nenhum item técnico é pergunta institucional automaticamente reaberta. G-C não pode ser PASS sem #703; G-B não é alegado por schemas/fixtures. Todas decisões D-001…097 estão rastreadas no MASTER_SPEC, inclusive visuais mantidas para futuro.
