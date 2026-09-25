# Preview administrativo com dados reais

O preview do Painel do Aluno está no projeto Cloudflare Pages separado
`ecossistema-escola-testes`, em
`https://admin.teste.escolaieda.com/#/painel-do-aluno`. O DNS GoDaddy usa o
CNAME `admin.teste` para `ecossistema-escola-testes.pages.dev`. A aplicação
Entra `Ecossistema Escolar - Preview Painel do Aluno` usa retorno exato nesse
host e exige atribuição ao grupo de administradores. O projeto oficial
`ecossistema-escola` e o host `admin.escolaieda.com` não recebem o deploy de
testes.

O projeto de testes tem `RUNTIME_ENVIRONMENT=preview`, sessão e certificado
Entra próprios, binding de leitura para `PORTAL_SERVICE`, Hyperdrive `PROD_DB`
existente e uma chave Supabase exclusiva em secret Pages. A chave Supabase é
privilegiada; somente o backend a recebe. `server/preview-read-only.ts` bloqueia
os endpoints de escrita antes que alcancem Worker, Storage ou PostgreSQL.
Consultas POST permitidas são Portal `query`, estado da foto e pesquisa de
turmas do Banco. A sessão administrativa e as verificações de origem continuam
obrigatórias. A aplicação pode mostrar ações existentes, mas a API do preview
recusa sua execução.

Depois de alterar a branch, confirme lint, tipos e teste direcionado e rode
`scripts/deploy-student-panel-preview.ps1`. O script exige essa branch, faz o
build, usa `wrangler.preview.jsonc` apenas durante o deploy e restaura
`wrangler.jsonc` byte a byte. A compilação das Functions exige o artefato
homologado `node_modules/.cache/student-photo-codec-v1/codec.wasm`, disponível
no workflow `student-photo-codec-proof`. O Pages é Direct Upload, então a
publicação da branch é manual. A URL estável aponta para o branch de testes.

Nunca registrar nomes, notas, nascimentos, fotos, respostas de API ou segredos
em commits, issues, logs ou capturas de tela. A validação visual privada deve
ocorrer no navegador autenticado.
