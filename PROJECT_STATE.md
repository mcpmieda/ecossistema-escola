# PROJECT_STATE — Ecossistema Escolar

## Estado atual

O Centro de Administração está em produção em `https://admin.escolaieda.com`.

O Banco de Notas está incorporado ao mesmo repositório, com rota canônica `/banco-de-notas` e APIs same-origin em `/api/banco-notas/v1/*`.

## Processo de desenvolvimento

A App Factory **não governa mais este projeto por padrão**. `.app-factory.json` registra `governance: none`.

Mudanças comuns seguem o fluxo normal do repositório:

- branch/PR;
- formatação, lint e typecheck;
- testes;
- build da aplicação;
- verificações extras somente quando a superfície alterada exigir.

Não são obrigações gerais de cada mudança:

- Project Adoption Gate;
- Semantic Assurance/Verification;
- Independent Verification;
- Merge Train;
- atualização de handoff ou deste arquivo;
- recovery drill;
- validação do add-in quando o add-in não mudou.

A documentação e specs históricas preservam decisões e evidências, mas não constituem gates automáticos.

## Banco de Notas

Regras técnicas que permanecem importantes:

- HeroUI React v3 é o design system do módulo; Ambient Constellation permanece proibido.
- Autorização protegida permanece server-side.
- Cloudflare D1 é o armazenamento transacional estruturado do Banco.
- SharePoint/OneDrive armazenam e versionam arquivos; Graph é acessado pelo backend quando necessário.
- Ausência de nota não é zero implícito.
- Fontes concorrentes não podem ser combinadas silenciosamente.
- Dados reais de alunos/professores, notas, tokens e secrets não entram no Git ou em logs públicos.
- Golden masters privados continuam apenas como material autorizado de regressão e não entram no produto.

## Entrada de notas por planilha

O caminho inicial operacional adotado é o fluxo de upload administrativo de cópia XLSX e análise controlada. A sincronização automática por add-in não é requisito do funcionamento atual e não deve gerar trabalho ou gates por padrão.

## Continuidade

Atualize este arquivo somente quando o estado global do produto mudar de maneira relevante. Para histórico detalhado de implementações, experimentos e homologações, use o histórico do Git e os documentos específicos já existentes.
