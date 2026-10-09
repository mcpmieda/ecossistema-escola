# Retirada da interface Centrais

Solicitação do responsável em 09/10/2026: retirar Centrais e adaptar seus consumidores sem deixar órfãos. Base de implementação: `main@4ca1bf735a639bf4bbaaefba95082ab20aa3ae99`.

## Impacto funcional

- A aba Centrais, as quatro fichas cadastrais (aluno, turma, professor e componente), sua pesquisa e os resumos daquela tela deixam de ser oferecidos.
- Menu lateral e busca global deixam de listar Centrais. O restante da busca conserva o comportamento existente; a investigação separada da busca global não faz parte desta retirada.
- O detalhe de Desempenho mantém notas, trajetória, componentes, foto e navegação acadêmica. Somente o botão “Ver cadastro nas Centrais” é retirado.
- Links antigos `#/banco-de-notas?area=operational` abrem Importação. A normalização usa `replaceState`, tanto na entrada quanto em `hashchange`, sem criar uma entrada adicional no histórico. A importação já montada conserva seu estado.
- Estado de alvo cadastral (`targetStudentId`, `studentNavigationEpoch`, `openStudent`) é removido do contexto anual porque não tem mais consumidor.

## Fronteira preservada

| Código/serviço                                             | Consumidor efetivo                                                   | Tratamento                                                   |
| ---------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------ |
| `operational-workspace-client-v2.ts`, operação `bootstrap` | `GradebookYearProvider`                                              | Preservado: lista de anos, recarga e isolamento global       |
| Mesmo cliente, operação `search` de turmas                 | `createPortalClassCatalogV2` / Painel do Aluno                       | Preservado: inclui turmas sem contas                         |
| `operational-workspace-request-gate.ts`                    | `useRelationalPerformanceV2` e `usePerformanceAnalyticsV6`           | Preservado: cancelamento e descarte de respostas obsoletas   |
| Contrato V2 e `/api/gradebook/operational-workspace`       | Consumidores acima e compatibilidade das leituras `context`/`center` | Preservados sem mudança de formato ou autorização            |
| Relação/cadastros anuais, vínculos e ofertas               | Importação, Desempenho, Conselho, Boletins, Relatórios e Portal      | Preservados; não há DDL, DML, migration ou exclusão de dados |

Arquivos retirados: `src/platform/gradebook-operational-surface.tsx`, `src/features/gradebook/operational-workspace/relational-workspace-page-v2.tsx` e `src/features/gradebook/operational-workspace/use-relational-workspace-v2.ts`. Não remover o diretório inteiro pelo nome: o cliente e o request-gate ainda possuem consumidores.

O transporte compartilhado retém as consultas cadastrais de compatibilidade. A retirada da UI não constitui autorização para quebrar DTOs externos, remover banco, mudar fonte, regras acadêmicas, segurança, importação ou infra. Não há limpeza de armazenamento do navegador nem reinterpretação de boletins publicados.

## Verificação

Regressões específicas em `tests/gradebook/centers-retirement-v1.test.tsx`: inventário de UI/menu, favorito antigo, navegação repetida, eventos de histórico, preservação de importação e teclado. As suítes de cliente/ano, catálogo do Portal, detalhe de Desempenho, isolamento anual, integração e privacidade são adaptadas sem retirar os gates de transporte/servidor.

Registrar os resultados efetivos e o SHA final na PR. Testes sintéticos e build não substituem uso autenticado em produção. A validação visual de produção só ocorre depois de publicação autorizada.

## Publicação e reversibilidade

Entrega em uma PR draft para revisão. O responsável determinou em 09/10/2026 que a publicação ocorre somente com sua autorização. Não habilitar auto-merge, integrar à main ou disparar deploy nesta entrega sem nova autorização explícita. Os workflows de PR fazem validação; o deploy produtivo é acionado por push em main ou disparo manual, não pela abertura da PR.

A alteração é reversível por código e não exige restaurar dados. Como o serviço e seu contrato permanecem, a volta da interface não depende de migration ou reconstrução cadastral.
