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
