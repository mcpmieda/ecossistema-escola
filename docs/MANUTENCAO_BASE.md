# Manutenção da fundação

## Rotina automática

O workflow `Rotate technical identity` executa toda segunda-feira às 06:17 UTC. Ele autentica no Entra por GitHub OIDC, verifica os certificados Web e Graph e só rotaciona quando restam 60 dias ou menos. Os certificados novos duram 180 dias e ocupam alternadamente os slots A/B.

Sequência segura: criar candidato → confirmar propagação no Entra → testar emissão de token → salvar no slot Cloudflare → publicar Pages → validar o runtime autenticado → testar CENTROADMIN e outro site 403 → manter dois slots → remover apenas a credencial excedente → publicar artefato redigido por 90 dias. O workflow usa concorrência serial e nunca cancela uma rotação em andamento.

Auditoria: GitHub → `mcpmieda/ecossistema-escola` → Actions → `Rotate technical identity`. Um resultado `not-due` é normal. Em sucesso de rotação, o artefato registra target, slot, key ID, datas, contagem de listas, 403 externo e correlation ID, sem chave privada.

## Manutenção inevitável

- Tratar imediatamente alertas de falha do GitHub Actions; repetir o workflow só depois de ler o artefato/log redigido.
- Revogar e substituir `CLOUDFLARE_API_TOKEN` somente em caso de exposição, mudança de política ou revogação. Ele não expira por data.
- Girar `SESSION_SECRET` somente em incidente; a troca encerra sessões de até 8 horas.
- Atualizar dependências por mudança de segurança/compatibilidade, sempre passando `npm run verify` e CI.

Não há tarefa mensal de conferir validade. Não há e-mail diário, Outlook persistente ou segredo de bootstrap expirável.

## Diagnóstico

1. Verifique primeiro `https://admin.escolaieda.com/api/health`.
2. Abra GitHub Actions e confirme o último CI/deploy.
3. Para login, confirme redirect URI, certificados Web e configuração do tenant.
4. Para SharePoint, confirme `Sites.Selected` e o grant `CENTROADMIN → write`.
5. Use o correlation ID da resposta para localizar o evento técnico no Cloudflare.

Erros conhecidos já resolvidos:

- `AADSTS700213`: o tenant recebeu subject com IDs imutáveis do GitHub; a FIC foi corrigida para o valor exato.
- Secret Pages não aparecia no runtime até um novo deploy; o workflow agora republica antes da validação.
- `Illegal invocation` no `fetch`: o adapter passou a usar wrapper de chamada.
- consistência eventual de `keyCredentials`: cleanup exige três leituras consecutivas confirmando ausência.

## Rollback documentado — não executar por rotina

1. Remover o CNAME `admin` na GoDaddy.
2. Remover custom domain e projeto `ecossistema-escola` em Cloudflare Workers & Pages.
3. Revogar o token account-owned `GitHub Deploy - ecossistema-escola`.
4. Excluir as três app registrations novas (Web, Graph Backend e Maintenance), após confirmar que não são usadas.
5. Remover o grant Sites.Selected do CENTROADMIN.
6. Excluir o site CENTROADMIN pelo SharePoint Admin Center e observar a lixeira de sites.
7. Arquivar/excluir o repo privado somente depois de preservar documentação.

Nunca incluir no rollback os cinco grupos existentes nem o fluxo `AUTO | Grupos por Cargo | Microsoft 365`.

## Manutenção das GitHub Actions

Dependabot verifica Actions toda segunda-feira, após cooldown de sete dias, e abre PR sem automerge. Em cada PR, confirme a release oficial, o SHA completo, as notas da versão e os gates `Validate application` e `Validate GitHub Actions security`. Actionlint e zizmor devem permanecer bloqueantes para o deploy.

Nunca troque pins completos por tags `@vX`. Não amplie `permissions`, não entregue secrets ao job de validação e não mova `id-token: write` para o workflow comum. A rotação deve continuar automática, serial, com `cancel-in-progress: false`, `environment: production`, guarda `github.ref == 'refs/heads/main'` e sem aprovação humana periódica. Essa guarda impede que uma execução manual selecionando outra ref receba OIDC ou secrets de produção.
