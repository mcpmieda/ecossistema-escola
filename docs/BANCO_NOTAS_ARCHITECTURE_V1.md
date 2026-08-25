# Banco de Notas — Arquitetura inicial v1

Data: 25/08/2026

Estado: decisão arquitetural pré-implementação. Este documento não declara o Banco de Notas pronto nem libera produção.

## 1. Objetivo

Incorporar o Banco de Notas como o primeiro sistema especializado do Centro de Administração, preservando integralmente a fundação já publicada e transformando a antiga estratégia de importação isolada em uma arquitetura de fontes configuráveis: legado por lote e modelo do professor vinculado em baixa latência.

O Banco permanece um domínio próprio. O Centro fornece shell, identidade, autorização, navegação e contrato de integração; regras pedagógicas, notas, fontes, modelos, conselho, boletins, análises e configurações pertencem ao módulo.

## 2. Precedência das fontes de especificação

1. `Relatorio_Completo_Banco_de_Notas_v1.6_consolidado`: autoridade funcional/pedagógica do produto.
2. `Dossie_Tecnico_Modelo_Professor_Integracao_Banco_de_Notas_v1.0`: autoridade sobre a nova fonte vinculada, modelo Excel, add-in, eventos, compartilhamento e reconciliação.
3. `Plano_Mestre_antigo_antes_do_dossie.Reconstrucao_Planilha_Banco_de_Notas_v0.3`: referência histórica de reconstrução e regressão do Excel.
4. `mcpmieda/escolaieda` commit `211251908efe078a8b75396e71e94827293da860`: POC e contratos técnicos já comprovados; não é o runtime definitivo.
5. `mcpmieda/ecossistema-escola`: autoridade da fundação em produção.

Quando o Relatório v1.6 ainda falar apenas em importação desconectada e o Dossiê definir a fonte vinculada posterior, o Dossiê prevalece somente nesse aspecto. As regras funcionais do Relatório continuam válidas.

## 3. Integração com o Centro de Administração

### 3.1 Forma de execução

Decisão: **módulo same-origin dentro do mesmo domínio e do mesmo repositório**, com fronteira de domínio explícita.

- Centro: `https://admin.escolaieda.com/`
- Banco: `https://admin.escolaieda.com/banco-de-notas`
- subrotas: `/banco-de-notas/...`
- API: `/api/banco-notas/v1/...`
- health contratual: `/api/banco-notas/health`

O módulo será registrado por `server/modules/contracts.ts` e por `PLATAFORMA_MODULOS`, seguindo `docs/CONTRATO_MODULOS.md`. O Centro apresenta o Banco como sistema integrado apenas quando manifesto, registro e capabilities estiverem compatíveis.

### 3.2 Por que não usar `#bancodenotas`

A rota hash serviu ao núcleo inicial porque evitava mudanças de infraestrutura durante a candidata. Para o primeiro sistema real, manter hash como padrão criaria um endereço menos limpo e conflitaria com o contrato atual de módulos, cujo `baseRoute` é um caminho same-origin.

Cloudflare Pages já oferece fallback de SPA para caminhos quando não existe `404.html` de topo. O `_routes.json` atual invoca Functions apenas em `/auth/*` e `/api/*`; portanto, caminhos como `/banco-de-notas/...` permanecem no fluxo estático/SPA. Não é necessário reconstruir o BFF para obter URLs limpas.

O núcleo existente pode continuar temporariamente com hashes internos. A migração das rotas antigas, se desejada, será uma mudança separada para não acoplar o Banco a uma refatoração desnecessária do Centro.

### 3.3 Estrutura de código pretendida

```text
src/
  banco-notas/
    app/
    components/
    pages/
    features/
    data/
    routing/
    styles/
server/
  banco-notas/
    api/
    auth/
    domain/
    graph/
    repositories/
    services/
shared/
  banco-notas/
    contracts/
    schemas/
infra/
  banco-notas/
    d1/
    cloudflare/
    microsoft/
specs/
  banco-notas/
```

Isso é um **modular monolith** no mesmo deploy de frontend/BFF, não um conjunto de microserviços artificiais. Workers auxiliares entram somente para processamento assíncrono real.

## 4. Fontes do Banco de Notas

A configuração `Fonte` é obrigatória por ano letivo e pode ter override por professor durante migração.

### 4.1 `legacy_import`

Uso: anos e planilhas antigas, importadas como lotes imutáveis/auditáveis.

Princípios:

- origem permanece intacta;
- hash SHA-256 antes do processamento;
- cada lote recebe ID, data, professor, ano, arquivo, versão do importador e evidências;
- preservar arquivo/guia/célula/fórmula/valor/tipo de origem quando aplicável;
- ausência não vira zero;
- importação repetida do mesmo conteúdo é idempotente;
- promoção do lote para fonte válida é explícita;
- resultados já consolidados pela planilha podem permanecer autoridade conforme o perfil daquele ano.

Arquivos XLSB antigos continuam sendo suportados como legado. O conversor COM já comprovado em `mcpmieda/escolaieda` é **oráculo de regressão e ponte de migração**, não arquitetura final do runtime. A implementação definitiva deverá substituir dependência de Excel COM por processamento remoto seguro ou por conversão administrativa controlada que grave o resultado no Banco via API. Até essa substituição passar regressão real com Nina/Alanna, não eliminar o conversor homologado.

### 4.2 `linked_teacher_model`

Uso: modelo novo `.xlsx` individual do professor, gerado/validado pelo Banco e armazenado em SharePoint.

Fluxo principal:

```text
Banco configura professor/turmas/disciplinas/ruleset
→ gera ou instancia XLSX homologado
→ SharePoint armazena e versiona
→ Graph concede acesso ao usuário Entra correto
→ modelo inicia SyncEnabled=false
→ equipe reconcilia modelo e Banco
→ gestor ativa sincronização
→ professor edita
→ add-in Office.js identifica célula mapeada
→ POST grade.changed na API Cloudflare
→ Banco aplica idempotência + sequência + autorização
→ snapshot transacional é atualizado
→ derivados são recalculados de forma versionada
→ grade.recalculated mantém a mesma correlação
→ central acompanha, audita e reconcilia
```

O add-in é a fonte primária de baixa latência porque conhece `GradeKey`, campo, planilha, endereço e sequência. Microsoft Graph permanece responsável por arquivo, permissão, leitura de tabelas e reconciliação; não deve ser usado como substituto do evento de célula.

### 4.3 Convivência durante migração

Default seguro: `sourceAuthority = explicit-per-teacher-year`.

- um professor/ano possui uma fonte ativa de autoridade por vez;
- lotes antigos permanecem no histórico;
- ativar `linked_teacher_model` não apaga legado;
- nenhuma lógica escolhe silenciosamente "o valor mais recente" entre duas fontes concorrentes;
- migração pode ocorrer professor a professor;
- `effectiveFrom`, `effectiveTo`, operador e motivo ficam auditados.

Se a instituição desejar outra política de precedência no futuro, ela vira configuração versionada, não condição escondida no código.

## 5. Persistência e responsabilidade

### 5.1 Cloudflare D1 — banco transacional oficial

Escolha: **Cloudflare D1** para dados estruturados do Banco de Notas.

Responsabilidades:

- anos letivos e configurações versionadas;
- professores e atribuições do Banco;
- estudantes/turmas/componentes normalizados necessários ao domínio;
- fontes e lotes de importação;
- `TeacherModel` e versões;
- `CellMapping`;
- `GradeEvent` append-only;
- `GradeSnapshot` corrente;
- `RelationshipSnapshot`;
- regras/rulesets e versões;
- auditoria de compartilhamento e mudanças;
- conselhos, snapshots históricos, boletins emitidos e demais dados do produto conforme a especificação funcional.

Motivo: o próprio Dossiê proíbe promover o adaptador SharePoint/Graph da POC a banco transacional definitivo. D1 mantém o runtime no ecossistema Cloudflare já adotado e permite operações SQL atômicas e recovery por Time Travel.

### 5.2 SharePoint/OneDrive — arquivos institucionais

Responsabilidades:

- arquivo mestre homologado;
- instâncias XLSX dos professores;
- versionamento do arquivo;
- origens legadas em área restrita;
- arquivos de exportação quando a política exigir armazenamento Microsoft;
- compartilhamento específico ao professor.

SharePoint não será usado como tabela transacional de eventos de nota.

### 5.3 Microsoft Graph

Responsabilidades:

- resolver e conferir identidades/recursos Microsoft quando necessário;
- criar/consultar DriveItems;
- compartilhar arquivo com usuário Entra específico;
- verificar permissão efetiva;
- ler `TB_LANCAMENTOS`/tabelas técnicas para reconciliação do novo XLSX;
- consultar versões/metadados do arquivo;
- apoiar importação e geração onde a API for apropriada.

Nenhum acesso Graph privilegiado ocorre diretamente no browser do Banco.

### 5.4 Cloudflare Queues

Usar apenas para trabalho assíncrono que não deve bloquear uma requisição:

- importação pesada;
- geração/validação de modelos;
- reconciliação de grande volume;
- exportações volumosas;
- reprocessamentos.

`grade.changed` não deve ser artificialmente atrasado só para passar por fila. A confirmação mínima do evento e do snapshot deve ocorrer na API transacional; derivados pesados podem ser enfileirados depois da confirmação.

## 6. Contrato transacional de notas

O contrato v1 já comprovado em `mcpmieda/escolaieda` é preservado semanticamente.

Regras obrigatórias:

- `Idempotency-Key` obrigatório para comando de evento;
- chave repetida não cria segundo efeito lógico;
- sequência por origem impede regressão;
- `stale` é armazenado/auditável, mas não substitui snapshot novo;
- `grade.changed` confirma a entrada aceita sem esperar todos os derivados;
- `grade.recalculated` usa o mesmo `correlationId`;
- `grade.reverted` é evento explícito, sem apagar histórico;
- vazio é ausência/null;
- cada snapshot aponta para evento/versão/ruleset que o produziu.

Implementação D1 deve usar constraints únicas e transação/batch atômico suficiente para impedir corrida entre idempotência, sequência e atualização do snapshot.

## 7. Autenticação e autorização

### 7.1 Interface administrativa

Reutilizar a autenticação Entra/BFF já existente e o cookie HttpOnly selado. O Banco não cria um segundo login.

Capabilities iniciais propostas:

- `grades.read`
- `grades.analytics.read`
- `grades.sources.read`
- `grades.sources.manage`
- `grades.models.read`
- `grades.models.manage`
- `grades.import.run`
- `grades.council.read`
- `grades.council.manage`
- `grades.reports.read`
- `grades.reports.issue`
- `grades.audit.read`
- `grades.settings.read`
- `grades.settings.manage`

A matriz exata será versionada e testada. Ocultar botão não conta como autorização.

### 7.2 Add-in

O add-in é um consumidor independente da API e não deve depender do cookie administrativo como única forma de autenticação.

Antes do piloto, definir e provisionar um audience/scope Entra apropriado para a API do Banco ou uma estratégia equivalente formalmente validada. O Worker valida issuer, audience, assinatura, expiração e identidade antes de aceitar `grade.changed`.

Não colocar client secret no add-in.

## 8. UI/UX HeroUI

### 8.1 Design system

- HeroUI React v3 é obrigatório e transversal.
- Não usar shadcn, ReUI ou wrappers que imitem API de outro design system.
- Professional UI Profile: `professional-default`.
- Motion Profile: `ambient` apenas para transições e microinterações semânticas.
- Ambient Surface Profile: **desativado**.
- Ambient Constellation: **proibido**.

A presença forte de HeroUI virá de composição, componentes nativos, hierarquia, estados, tipografia, overlays, coleções e interação — não de partículas ou fundo decorativo.

### 8.2 Shell do Banco

Estrutura inicial:

- header global com ano letivo, busca global, estado da fonte e perfil;
- navegação lateral própria do domínio em desktop e Drawer HeroUI em mobile;
- breadcrumb real;
- área de conteúdo com superfícies limpas e hierarquia forte;
- feedback de fonte/sincronização sempre visível quando relevante.

Áreas principais:

1. Visão geral
2. Acompanhamento
3. Alunos
4. Turmas
5. Componentes
6. Professores
7. Conselho de Classe
8. Boletins
9. Fontes e Modelos
10. Auditoria
11. Configurações

A Pesquisa Global deve ser acessível em qualquer área e integrar entidades, funções e configurações conforme a especificação v1.6.

### 8.3 Configurações

A central deve ser categorizada, pesquisável e extensível. A categoria **Fonte** é obrigatória e deve mostrar:

- fonte padrão do ano;
- overrides por professor;
- modo de autoridade;
- estado da migração;
- política de importação idempotente;
- SyncEnabled default;
- ambiente homologation/production;
- reconciliação;
- retry/queue/debounce;
- aprovação antes de compartilhar;
- regras de conflito;
- retenção e histórico.

Parâmetros técnicos avançados devem ter defaults seguros, ajuda curta e não poluir o fluxo comum.

## 9. Modelos de dados mínimos da nova fonte

Primeiro conjunto obrigatório:

- `SchoolYear`
- `DataSource`
- `SourceAssignment`
- `Teacher`
- `TeacherAssignment`
- `Student`
- `ClassGroup`
- `Component`
- `RelationshipSnapshot`
- `ImportJob`
- `ImportFinding`
- `TeacherModel`
- `TeacherModelVersion`
- `CellMapping`
- `GradeEvent`
- `GradeSnapshot`
- `Ruleset`
- `RulesetVersion`
- `ShareAudit`
- `ReconciliationRun`
- `AuditEvent`

As entidades funcionais adicionais do Relatório v1.6 entram por fatias próprias sem alterar o princípio de rastreabilidade.

## 10. Rollout

### Fase 0 — adoção e contrato

- App Factory registrada;
- arquitetura e decisões versionadas;
- semantic/verification specs do Banco antes do código.

### Fase 1 — módulo + persistência + fonte dual

- rota e manifesto;
- capabilities;
- D1 + migrations;
- API base;
- configuração `Fonte`;
- import job e teacher model contracts;
- HeroUI shell real.

### Fase 2 — nova fonte vinculada

- storage SharePoint;
- Graph share/reconcile;
- endpoint transacional `grade-events`;
- adaptação do add-in da POC para API definitiva;
- modelo Nina em homologação com `SyncEnabled=false`;
- teste ida/reversão/reconciliação.

### Fase 3 — produto funcional completo

Implementar as áreas do Relatório v1.6 em fatias grandes: acompanhamento, entidades, análises, conselho, boletins, pesquisa, auditoria e configurações.

### Fase 4 — piloto e produção

- grupo piloto;
- concorrência/offline/retry/stale;
- p95/p99 e carga proporcional;
- recovery;
- aceite pedagógico;
- migração professor a professor;
- liberação formal.

## 11. Decisões que viram configuração

Sem nova consulta ao usuário, adotar default seguro e configurável para:

- fonte padrão e overrides;
- modo de precedência durante migração;
- debounce;
- retry/backoff;
- queue limit;
- frequência de reconciliação;
- limites e máximos por ruleset;
- arredondamento por ano/perfil;
- regras específicas por componente/período;
- retenção operacional dentro do limite legal/institucional;
- política de emissão/reemissão de boletins;
- regras de Conselho já marcadas como configuráveis no documento funcional.

Continuam exigindo decisão humana quando aplicável: mudança jurídica/pedagógica sem fonte normativa, gasto novo, permissão Microsoft de alto impacto, liberação em massa ou operação destrutiva.

## 12. Restrições

- GitHub nunca é fonte de dados de runtime.
- Não publicar dados reais de estudantes/professores no Git, Pages público ou logs públicos.
- Não transformar POC `NOTAS_POC_*` em banco oficial por conveniência.
- Não reconstruir a infraestrutura estável do Centro.
- Não duplicar autenticação ou autorização.
- Não adicionar outro design system.
- Não reintroduzir Ambient Constellation.
- Não migrar todos os professores antes do piloto e da reconciliação individual.
