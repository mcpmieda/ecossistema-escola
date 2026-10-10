# Retirada da aba Relatórios - candidata de 10/10/2026

Pedido explícito do responsável: excluir a aba Relatórios e o código exclusivo, preservando consumidores. Base inspecionada: `main@e9f5eb576b242fc9018881fd56bcc638ff1e91e5`. Esta entrega fica em branch independente e PR rascunho; não declara remoção em produção, merge, deploy ou homologação real.

## Alvo e remoção

O alvo é `#/banco-de-notas?area=reports`, identificado em `notes-module.ts` e `gradebook-workspace-shell.tsx`, com a página `relational-institutional-reports-page-v2`. O botão singular Relatório proposto para Importação não integra este escopo.

Saem a entrada do menu lateral, aba, pesquisa, ícone, preload/lazy import, cache de montagem e cliente institucional; o painel docente exclusivo dessa aba; serviços/contratos institucionais V1 e V2; handler institucional; adapter SQL `relational-import-diagnostics-read-v2`, usado somente pelo serviço retirado; classificação de operações/DTOs exclusivos no rate limiter; suites exclusivas dos módulos removidos. Não foram encontrados CSS, imagens, fontes ou pacotes npm exclusivos. O lockfile e as dependências permanecem iguais.

## Consumidores preservados

| Recurso | Consumidor remanescente |
| --- | --- |
| `PerformanceTeacherExportV6`, analytics V6, PDF docente | `performance-analytics-workspace-v6`, dentro de Desempenho |
| Desempenho V2/V3/V4/V5/V6, motor e projeções | rotas e interfaces de Desempenho, além do Portal e Conselho conforme seus contratos |
| Serviço, contrato, snapshot e renderers PDF de Boletins | emissão, histórico e reimpressão na aba Boletins |
| Conselho V3 e projeções anuais | aba Conselho e consumidores acadêmicos vigentes |
| Diagnósticos da Importação, endpoint e tratamento humano | Importação e Auditoria Atual |
| Ano global e cadastro anual | Importação, Desempenho, Conselho, Boletins, Configurações e Portal |
| Autorização `gradebook.persistence.admin` | todas as áreas acadêmicas administrativas vigentes |

O Audit Workspace V1 já não tinha consumidor de runtime nesta base: seu runtime foi arquivado pela #1079. Contratos/núcleo/testes históricos relacionados a outras entregas não são apresentados como consumidores ativos de Relatórios nem foram removidos genericamente. `Aprendizados`, checkpoints e `PROJECT_STATE.yaml` permanecem históricos; a fonte de estado desta candidata é este documento e a PR.

## Endereços antigos

`#/banco-de-notas?area=reports` e a variante `#banco-de-notas?area=reports` são normalizados para Importação com `replaceState`, sem acrescentar entrada ao histórico. A mesma normalização ocorre em hashchange, inclusive ao voltar/avançar; Importação já montada conserva seu lote. Parâmetros homônimos em outros módulos não são reescritos. Menus, busca e teclado usam apenas áreas vigentes.

`POST /api/gradebook/reports` fica somente como tombstone de compatibilidade em `retired-reports-route.ts`: origem oficial, método, identidade e capacidade continuam exigidos; usuário autorizado recebe HTTP 410 com `{ state: 'retired' }` e `Cache-Control: no-store`. O dispatch ocorre antes do wrapper de banco. Não lê corpo, constrói serviço, exporta, consulta binding ou depende de rate limiter externo; não precisa interpretar contratos de uma funcionalidade retirada. Nenhum guard de operação vigente foi desativado. Clientes externos devem tratar 410 como retirada definitiva.

## Verificação e limites

Os testes exclusivos retirados não são contados como cobertura de comportamento remanescente. Integrações históricas continuam verificando Conselho, Desempenho, durabilidade e PDF; as expectativas de montagem institucional são retiradas. O ensaio de recuperação usa diretamente catálogos/histórico de Boletins, comparação trimestral, Conselho e a leitura SQL de diagnósticos correntes, sem manter o agregador retirado. A suíte de contenção PostgreSQL permanece condicionada ao banco local descartável configurado originalmente.

Regressões cobrem menu/busca, favoritos, hashchange, conservação do lote, teclado e parâmetros de outros módulos, além do dispatch HTTP V1/V2, 401/403/405, origem estrangeira, no-store, ausência de leitura do corpo e de acesso a storage. A revisão independente do mapa estático não encontrou imports órfãos, recursos exclusivos esquecidos ou consumidor remanescente quebrado.

Comandos de validação: `npm run typecheck`, suites direcionadas dos consumidores, `npm run verify` e workflow oficial da PR. Resultados efetivamente executados e SHA final ficam registrados na PR; este roteiro não presume sucesso de comandos pendentes. UI: preview local `dev:admin-preview` com massa inventada, sem banco produtivo. O navegador integrado falhou ao iniciar por `helper_sandbox_lock_failed`; qualquer alternativa/evidência visual é registrada separadamente na PR.

Não houve alteração de migrations, tabelas, dados produtivos, backups, contas, tokens, infraestrutura, gates de CI ou histórico Git. A PR #1268 e o repositório coletor-frequencia-smecel ficam fora desta entrega.
