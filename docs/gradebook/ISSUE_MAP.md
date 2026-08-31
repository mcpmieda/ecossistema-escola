# Mapa de issues — Banco de Notas

Este arquivo apresenta o projeto em linguagem simples. O estado legível por máquina fica em [`PROJECT_STATE.yaml`](PROJECT_STATE.yaml). Para iniciar agentes, consulte primeiro [`COMECE_AQUI.md`](COMECE_AQUI.md).

## Visão geral

- **Issue principal:** [#182](https://github.com/mcpmieda/ecossistema-escola/issues/182)
- **Integração atual:** [#246 — sétima onda](https://github.com/mcpmieda/ecossistema-escola/issues/246)
- **Site oficial:** `https://admin.escolaieda.com/#/banco-de-notas`
- **Onda atual:** #242, #243 e #244, simultaneamente.
- **Ondas concluídas:** primeira à sexta.
- **Armazenamento aprovado:** Cloudflare D1, conforme #200.
- **D1 atual:** migrations 0001–0003 e leitura local integradas; nenhum banco, binding ou adaptador de escrita remoto criado.
- **Saúde e limites:** #220 planejada no Centro de Administração.

## Fases

| Fase | Issue | Estado | Progresso objetivo | Resultado esperado no site |
|---|---:|---|---:|---|
| F0 — Fundação e coordenação | [#183](https://github.com/mcpmieda/ecossistema-escola/issues/183) | Publicada | 7/7 | Base para agentes |
| F1 — Fonte e importação | [#184](https://github.com/mcpmieda/ecossistema-escola/issues/184) | Validação final pendente | 6/7 | Importação confiável e rastreável |
| F2 — Modelo e persistência | [#185](https://github.com/mcpmieda/ecossistema-escola/issues/185) | Em construção | 5/6 | Dados disponíveis após recarregar |
| F3 — Motor nativo | [#186](https://github.com/mcpmieda/ecossistema-escola/issues/186) | Em construção | 4/7 | Comparação fonte × cálculo nativo |
| F4 — Reconciliação e Auditoria | [#187](https://github.com/mcpmieda/ecossistema-escola/issues/187) | Em construção | 4/6 | Revisão, pendências e promoção do lote |
| F5 — Contexto e centrais | [#188](https://github.com/mcpmieda/ecossistema-escola/issues/188) | Planejada | 0/7 | Aluno, turma, professor e componente |
| F6 — Desempenho | [#189](https://github.com/mcpmieda/ecossistema-escola/issues/189) | Planejada | 0/6 | Matriz analítica da turma |
| F7 — Conselho | [#190](https://github.com/mcpmieda/ecossistema-escola/issues/190) | Planejada | 0/7 | Fluxo operacional do Conselho |
| F8 — Boletins e relatórios | [#191](https://github.com/mcpmieda/ecossistema-escola/issues/191) | Planejada | 0/6 | Prévia, PDF, versões e relatórios |
| F9 — Piloto e produção | [#192](https://github.com/mcpmieda/ecossistema-escola/issues/192) | Planejada/transversal | 0/7 | Operação institucional validada |

## Entregas concluídas

| Issue | Resultado | PR/merge |
|---:|---|---|
| [#193](https://github.com/mcpmieda/ecossistema-escola/issues/193) | Esquema `SourceContractV1` | #207 / `83d7bf4` |
| [#194](https://github.com/mcpmieda/ecossistema-escola/issues/194) | Entidades acadêmicas V1 | #208 / `466717b` |
| [#195](https://github.com/mcpmieda/ecossistema-escola/issues/195) | Importador modularizado | #209 / `17ba8b1` |
| [#196](https://github.com/mcpmieda/ecossistema-escola/issues/196) | Lançamentos e resultados acadêmicos V1 | #212 / `6b8eb4c` |
| [#198](https://github.com/mcpmieda/ecossistema-escola/issues/198) | Fixtures sintéticas e protocolo privado | #213 / `32450ac` |
| [#197](https://github.com/mcpmieda/ecossistema-escola/issues/197) | Lote, reconciliação e Auditoria V1 | #216 / `0f1ba62` |
| [#201](https://github.com/mcpmieda/ecossistema-escola/issues/201) | Semântica nativa das células | #217 / `9476f84` |
| [#199](https://github.com/mcpmieda/ecossistema-escola/issues/199) | SHA-256, manifesto e proveniência visível | #225 / `bc82b35` |
| [#218](https://github.com/mcpmieda/ecossistema-escola/issues/218) | Arredondamento acadêmico nativo V1 | #224 / `dc54adc` |
| [#219](https://github.com/mcpmieda/ecossistema-escola/issues/219) | Portas de persistência e transação V1 | #223 / `65af08f` |
| [#226](https://github.com/mcpmieda/ecossistema-escola/issues/226) | Composição trimestral 30/30/40 e 45/55 | #231 / `5780f88` |
| [#227](https://github.com/mcpmieda/ecossistema-escola/issues/227) | Schema D1 base: migrations 0001–0002 e 19 tabelas | #233 / `781a2a2` |
| [#228](https://github.com/mcpmieda/ecossistema-escola/issues/228) | Planejador idempotente de reimportação | #232 / `9b4e4fa` |
| [#234](https://github.com/mcpmieda/ecossistema-escola/issues/234) | Recuperação paralela nativa V1 | #240 / `810880c` |
| [#235](https://github.com/mcpmieda/ecossistema-escola/issues/235) | Migration 0003, catálogo fonte ↔ stream e leitura D1 local | #241 / `b9bdeff` |
| [#236](https://github.com/mcpmieda/ecossistema-escola/issues/236) | Executor transacional abstrato do plano | #239 / `e8be42b` |

O conjunto da sexta onda foi publicado pelo deploy `33441758173`. Não houve nova tela nessa onda.

## Onda 7 — pronta para agentes

As três issues abaixo escrevem em áreas separadas e podem ser executadas ao mesmo tempo:

1. [#242 — consolidar resultado trimestral nativo V1](https://github.com/mcpmieda/ecossistema-escola/issues/242)
   - Reutiliza paralela, composição e arredondamento já integrados.
   - Produz nota bruta, nota nativa, percentual, cobertura e achados, sem IDs artificiais.

2. [#243 — contrato transacional da associação fonte lógica ↔ stream](https://github.com/mcpmieda/ecossistema-escola/issues/243)
   - Formaliza a porta de associação e sua presença no plano, estimativa e executor.
   - Não implementa SQL de escrita; impede efeito colateral oculto no futuro adaptador.

3. [#244 — recuperação final nativa V1](https://github.com/mcpmieda/ecossistema-escola/issues/244)
   - Usa total anual inferior a 60 e limites trimestrais 18/18/24.
   - REC aplicável substitui a nota original mesmo quando menor, preservando o histórico.

O integrador acompanha os três trabalhos em [#246](https://github.com/mcpmieda/ecossistema-escola/issues/246).

## Adaptação de contrato identificada na sexta onda

A #235 entregou a relação física e a leitura `logical_source_id ↔ record_kind + stream_key`. A #236 entregou o executor contra `PersistenceUnitOfWorkV1`. A integração mostrou que a unidade de trabalho e o plano ainda não possuem uma operação explícita para versionar essa associação.

A correção oficial é a #243. Não é permitido:

- gravar a associação como efeito colateral escondido do append acadêmico;
- inferir a relação pelo nome do arquivo;
- varrer `payload_json` para decidir a fonte;
- desativar automaticamente itens ausentes da nova planilha.

## Próximas dependências conhecidas

| Tarefa | Liberação necessária |
|---|---|
| Resultado anual e precedências do motor | #242 + #244 integradas |
| [#245 — adaptador D1 local de escrita e promoção](https://github.com/mcpmieda/ecossistema-escola/issues/245) | #243 integrada |
| Binding D1 local/preview e migrations fora dos testes | adaptador de escrita aceito + issue de infraestrutura própria |
| Contexto global de ano/perfil 2026 | persistência local disponível |
| Saúde e limites globais (#220) | D1/bindings e backend de métricas reais |

## Dependências principais

```text
#226 + #234 ──> #242
#201 + #218 + #226 ──> #244
#235 + #236 ──> #243 ──> #245

#242 + #243 + #244 ──> integração #246

#242 + #244 ──> resultado anual
#245 ──> binding/preview e persistência operacional
```

## Estado real do D1

Já existe no repositório:

- migrations 0001–0003;
- 21 tabelas no catálogo local;
- FKs por ano, índices, histórico append-only e controle otimista;
- leitura local de manifesto, registro atual e streams por fonte lógica;
- executor abstrato com validação e rollback demonstrado em memória.

Ainda não existe:

- banco D1 provisionado;
- binding em ambiente;
- migration remota aplicada;
- adaptador D1 de escrita/transação;
- endpoint autorizado ligando a interface à persistência.

Portanto, atualizar a página ainda remove os dados importados da memória.

## Gates manuais

### Fonte real

A #198 entregou a massa sintética e `REAL_DATA_VALIDATION.md`. A execução controlada com o corpus real continua pendente antes do fechamento definitivo da F1.

### Interface do manifesto

O operador confirmou o happy path com dois arquivos XLSB: reconhecimento, SHA-256 abreviado, manifesto e leitura acadêmica apareceram corretamente. Ainda faltam expandir o hash completo, observar a etapa transitória e conferir uma falha isolada para encerrar o smoke completo.

Nenhum gate autoriza publicar arquivos, nomes, notas, hashes ou caminhos privados.

## Decisões vigentes relacionadas

- D1 é o armazenamento físico aprovado; acesso somente pelo backend.
- O domínio usa portas independentes do D1.
- Nome do arquivo não é identidade permanente.
- Mesmo hash não duplica; mudanças acadêmicas geram versões apenas do que mudou.
- Valores ausentes de uma nova versão não são apagados sem revisão.
- Valor importado e motor nativo permanecem separados; autoridade não muda silenciosamente.
- Saúde e limites pertencem ao Centro de Administração, não ao Banco isoladamente.

## Como iniciar um agente

Entregue ao agente somente uma issue marcada `[PRONTA]` e instrua-o a:

1. ler `AGENTS.md` e `docs/gradebook/`;
2. executar a tarefa diretamente, sem App Factory ou agentes auxiliares;
3. trabalhar apenas nos caminhos declarados;
4. criar branch curta e PR para `main`;
5. executar `npm run verify`;
6. publicar o handoff na própria issue;
7. não fazer merge, deploy, provisionamento ou alterar `PROJECT_STATE.yaml`.

## Critério de publicação

```text
issue → branch → PR → validação → integração → main → Cloudflare Pages → verificação
```

Entregas internas podem não produzir mudança visual, mas devem preservar o site e liberar a próxima dependência de forma verificável.
