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

Regressões específicas em `tests/gradebook/centers-retirement-v1.test.tsx`: inventário de UI/menu, favorito antigo, navegação repetida, eventos `hashchange` simulados, preservação de importação e teclado. Essa suíte jsdom não executa os comandos reais Voltar/Avançar de um navegador. As suítes de cliente/ano, catálogo do Portal, detalhe de Desempenho, isolamento anual, integração e privacidade são adaptadas sem retirar os gates de transporte/servidor.

Registrar os resultados efetivos e o SHA final na PR. Testes sintéticos e build não substituem uso autenticado em produção. A validação visual de produção só ocorre depois de publicação autorizada.

Na revisão da PR #1266, o comentário P3 sobre o nome do teste foi confirmado: a cobertura usa eventos sintéticos, não travessia nativa de histórico. O nome e esta documentação foram corrigidos sem mudar as asserções. Uma verificação complementar com navegador foi preparada, mas ficou bloqueada antes da renderização: Chromium local não iniciou por restrição de socket, e o navegador de nuvem não alcançou a porta local. Voltar/Avançar reais permanecem sem evidência adicional; isso não estabeleceu defeito funcional.

## Publicação e reversibilidade

Entrega inicialmente em PR draft para revisão. Em 09/10/2026, o responsável autorizou integrar e publicar especificamente a PR #1266 após verificar o comentário e confirmar os gates. Essa autorização permanece condicionada à revisão e ao CI do head final. Os workflows de PR fazem validação; o merge commit em main aciona o deploy produtivo oficial. Não habilitar auto-merge nem duplicar esse deploy com disparo manual.

A alteração é reversível por código e não exige restaurar dados. Como o serviço e seu contrato permanecem, a volta da interface não depende de migration ou reconstrução cadastral.
