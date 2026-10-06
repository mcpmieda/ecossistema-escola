# Demo pública do Portal do Aluno

Escopo: somente demonstração pública isolada com dados fictícios e botão administrativo
de ativar/desativar. Não há analytics, eventos, IPs, contadores, registros de visitantes,
retencão ou consultas de estatísticas na aplicação.

## Pacote e isolamento

- Build: npm run build:public-demo. Compila e faz dry-run, sem upload.
- Saída exclusiva: node_modules/.cache/public-portal-demo; nunca publicar dist do ADM.
- Worker: portal-aluno-demo-publica; configuração wrangler.public-demo.jsonc.
- Um Durable Object DemoState, binding DEMO_STATE, guarda apenas enabled e revision.
- Vínculo permitido: PUBLIC_DEMO_CONTROL somente no ADM, apontando ao entrypoint
  privado DemoControl do novo Worker. A demo não recebe acesso ao ADM ou ao Portal.
- Sem PROD_DB, PORTAL_SERVICE, sessão escolar, APIs de alunos ou fotos do sistema.
- O build não copia public/ nem lê .env. Quatro imagens locais versionadas são
  permitidas por hash; fontes são locais. A consulta opcional ao retrato local real
  foi removida da demo compartilhada.
- Preferências visuais usam publicPortalDemo: em hostname separado, sem identificador
  de visita, cookie ou transmissão. Não recuperam preferências/sessões da produção.

## Desativação

Default desabilitado; erro de estado ou binding ausente falha fechado.
assets.run_worker_first: true garante gate antes de HTML, assets, aliases, HEAD
e caminhos desconhecidos. Todas as respostas no-store, sem Set-Cookie; nenhum
cache de autorização ou Cache API. Previews e workers.dev estão false na
configuração candidata, até a etapa de publicação aprovada.

O ADM verifica autenticação, capability e Origin. O entrypoint privado valida
tenant, idade da autoridade e capability; CAS evita alterações concorrentes
silenciosas. A UI mostra somente estado confirmado.

Desativar impede novas requisições após a confirmação. Respostas já iniciadas e
conteúdo já entregue/baixado não podem ser recolhidos. A página aberta funciona
localmente, sem polling. Não publicar esse pacote em hospedagem estática que
contorne o Worker.

## Operação e validação

Workers Observability está desabilitado na configuração candidata. O código não
grava dados nem logs de visitantes; metadados operacionais da infraestrutura seguem
as políticas da Cloudflare. Não se promete ausência universal de coleta pelo provedor.

A conta foi informada pelo responsável como Paid. O desenho usa um Worker e um DO
do plano existente, sem novo contrato, upgrade ou mensalidade fixa específica.
Cada request invoca o Worker e consulta o DO; cotas da conta continuam aplicáveis.
Não aceitar custo adicional ou mudança de plano sem a autorização aplicável.
Referências: https://developers.cloudflare.com/workers/platform/pricing/
e https://developers.cloudflare.com/durable-objects/platform/pricing/

Testes: npm run build:public-demo, npm run test:public-demo-runtime, testes
public-demo-http-v1 e public-demo-control-ui-v1, regressões de notices/workspace.
verify inclui build e runtime da demo. O runtime usa pacote real e fixtures,
sem serviços externos; verifica gate em todos os arquivos, falta de storage,
controle privado/auth/CAS e desligamento efetivo. Não cria registros de acesso.

Antes de publicar: revisão no head final e CI/verify; revalidar nome disponível;
criar Worker/DO inicialmente desligado; configurar somente ADM→DemoControl e
publicar o ADM pelo workflow oficial; validar recusas e bloqueio real de HTML/assets;
ativar e entregar link após disponibilidade do controle. O vínculo ainda não foi
aplicado, nenhum recurso de nuvem foi criado e não houve publicação nesta fase.
