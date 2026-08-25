# AGENTS.md — Ecossistema Escolar

Este repositório é a fonte técnica de verdade do Centro de Administração e dos sistemas incorporados a ele. O Centro v1 já está em produção em `https://admin.escolaieda.com`; mudanças novas devem preservar a fundação existente e entrar por branch/PR com verificação proporcional.

## Governança

O projeto está explicitamente governado pela App Factory V1.4. Antes de implementação material, aplicar o Project Adoption Gate e manter `.app-factory.json`, `PROJECT_STATE.md`, especificações semânticas, plano de verificação e documentação de continuidade coerentes.

Entrada obrigatória de evolução: `factory-router`, seguindo `core/PROJECT_ADOPTION_GATE.md` da App Factory antes de alteração funcional ou visual material.

Referência da App Factory usada na adoção: `mcpmieda/app-factory`, baseline V1.4 e hardening HeroUI disponível no `main` auditado em 25/08/2026.

## Banco de Notas — trabalho ativo

Branch inicial: `feat/banco-de-notas-foundation`.

Fontes de produto e integração, em ordem de uso:

1. `Relatorio_Completo_Banco_de_Notas_v1.6_consolidado` — regras funcionais, pedagógicas, módulos, relatórios, acompanhamento, conselho, boletins, pesquisa, configurações e experiência geral.
2. `Dossie_Tecnico_Modelo_Professor_Integracao_Banco_de_Notas_v1.0` — substitui a hipótese antiga de importação isolada para a nova fonte vinculada; seus contratos de modelo, add-in, eventos, compartilhamento e reconciliação prevalecem para essa integração.
3. `Plano_Mestre_antigo_antes_do_dossie.Reconstrucao_Planilha_Banco_de_Notas_v0.3` — referência histórica de reconstrução e regressão do modelo Excel.
4. `mcpmieda/escolaieda` commit `211251908efe078a8b75396e71e94827293da860` — terreno técnico legado/POC do modelo do professor, conversor, add-in e contratos. Reutilizar conceitos e código válido, mas a implementação definitiva deve ser incorporada a este repositório.
5. Este repositório — fonte de verdade para infraestrutura, autenticação, autorização, contrato modular, Cloudflare, Entra, Graph, SharePoint e estado de produção.

Nenhum arquivo real de professor, nome/nota de estudante, token, secret ou exportação institucional deve entrar no Git.

### Regra crítica dos golden masters privados

- `NOTAS NINA 2026.xlsb`, `NOTAS ALANNA 2026.xlsb` e `Modelo_Professor_Nina_2026_Homologado.xlsx` são exclusivamente golden masters privados de homologação.
- Esses arquivos não são produto, template oficial ou fonte de configuração. Não podem entrar em runtime, D1, migrations, fixtures públicas, bundle, SharePoint definitivo ou distribuição.
- O produto deve possuir um modelo genérico limpo e um processo geral que transforme planilhas legadas de qualquer professor em uma nova instância desse modelo, pronta para conexão com o Banco.
- Nina e Alanna provam apenas regressão privada e generalização. Nenhuma regra de produção pode depender de nomes, quantidade de abas, turmas, disciplinas, endereços de célula ou qualquer particularidade desses arquivos.
- A decisão completa e seus gates estão em `docs/BANCO_NOTAS_MODELO_GENERICO_E_GOLDEN_MASTERS.md`.

## Decisões obrigatórias do Banco de Notas

- Design system: **HeroUI React v3 em 100% da interface** do Banco de Notas.
- Não introduzir shadcn, ReUI ou facades de compatibilidade visual no Banco.
- **Ambient Constellation é proibido** por decisão explícita do produto. Manter o efeito fora de login, shell, headers, cards, superfícies e estados especiais.
- HeroUI deve aparecer pela anatomia nativa: `Surface`, `Card`, `Table`, `ListBox`, `SearchField`, `Popover`, `Dropdown`, `Drawer`, `Alert`, `Chip`, `Progress*`, `Skeleton`, `Spinner`, `Breadcrumbs`, `Kbd`, `Avatar` e equivalentes adequados.
- O Banco é um módulo especializado incorporado ao Centro; o núcleo não copia suas regras internas.
- Rota canônica do módulo: `/banco-de-notas` e subrotas path-based. Não criar `#bancodenotas` como rota definitiva.
- APIs do módulo ficam same-origin em `/api/banco-notas/v1/*`.
- Frontend nunca acessa SharePoint/Graph diretamente para dados de negócio. Microsoft é acessado pelo backend/serviços autorizados.
- GitHub pode construir, testar, versionar e implantar, mas **não pode ser dependência de runtime**. Em produção, o fluxo é Microsoft/usuário → Cloudflare → Microsoft/Cloudflare conforme a responsabilidade.
- A fonte de notas é configurável por ano e por professor durante a migração: `legacy_import` para planilhas antigas e `linked_teacher_model` para o modelo novo sincronizado.
- Não mesclar silenciosamente duas fontes concorrentes. A autoridade precisa estar explícita e auditável por professor/ano e por data de vigência.
- `SyncEnabled=false` é o padrão de segurança para um modelo novo; ativação ocorre somente após validação e reconciliação individual.
- Ausência de lançamento é `null/ausente`, nunca zero implícito.
- Toda nota mantém origem, versão, fonte, estudante, turma, componente, período e rastreabilidade até arquivo/guia/célula ou evento.
- Eventos são idempotentes e ordenados; evento `stale` é auditável, mas não substitui snapshot mais novo.
- Dúvidas legítimas de comportamento devem virar configuração versionada com default seguro quando não houver uma regra de produto já consolidada.

## Persistência e integrações

- Microsoft Entra ID: identidade institucional.
- BFF/Cloudflare: autenticação de sessão existente para a interface administrativa e autorização server-side por capabilities.
- Cloudflare D1: persistência transacional estruturada do Banco, migrations, snapshots, configurações e auditoria.
- Cloudflare Queues: processamento assíncrono de importação, geração, reconciliação e tarefas pesadas quando necessário; não usar fila para transformar evento simples em latência desnecessária.
- SharePoint/OneDrive: arquivos mestre Excel, versões, origem dos modelos e compartilhamento institucional.
- Microsoft Graph: leitura/armazenamento/compartilhamento/reconciliação dos arquivos; não usar Graph/SharePoint como substituto de banco transacional.
- Add-in Office.js: fonte primária de baixa latência para alterações do novo modelo do professor.

## Mudanças em produção

- Não reconstruir Cloudflare, Entra, Graph, SharePoint `CENTROADMIN`, autenticação, sessão, grupos, CI/CD, rotação de identidade ou recovery existentes.
- Não escrever diretamente em `main`.
- Implementação deve passar CI e revisão antes de merge.
- Liberação funcional do Banco para produção segue o protocolo institucional vigente e não é inferida por CI verde.

## Continuidade obrigatória

Ao concluir qualquer bloco relevante do Banco de Notas, atualizar:

- `docs/BANCO_NOTAS_IMPLEMENTATION_STATE.md` — estado vivo, o que está pronto, o que foi comprovado e próximo marco;
- `docs/BANCO_NOTAS_HANDOFF.md` — ponto exato de retomada por outra inteligência;
- arquitetura/especificações quando a decisão mudar;
- `VERIFICATION.md` quando houver nova evidência real;
- `PROJECT_STATE.md` quando o estado global do repositório mudar.

O histórico de tentativas fica no Git; a árvore entregue deve conter somente a implementação vigente, sem camadas de CSS, funções duplicadas, facades ou código morto acumulado.
