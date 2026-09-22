# Recuperação da iniciativa #1101

Entrega candidata vinculada ao contrato #1102. Não encerra a iniciativa nem constitui homologação de produção.

## Proveniência

- ZIP fornecido pelo responsável, SHA-256 `6e1bbd737b1828e9d5aa890f078774f885b1fe3b3d4d00e8a6810d58cc67ce17`.
- Manifesto: 1.441 entradas conferidas contra os bytes do ZIP e da extração. A conferência no Windows usou caminhos longos quando necessário.
- Patch aplicado sobre `main@a3da4919fc9e2833d83ce9f7a6b585881679ba8d`, em clone separado e branch `recovery/1101-20260922`.
- Árvore recuperada exata: `28c7c46ccdd981a792754789ccfb780c0278aba4`; commit com histórico real: `f3fe89f6`. A capa #1100 está preservada.
- Objetos remotos parciais e a branch antiga não foram usados como fonte. O documento privado e suas imagens não integram esta entrega.

## Contratos e comportamento

Auditoria histórica: `includeEntities: true` habilita entidade, turma e operador capturados na transação. O nome do operador deriva exclusivamente da sessão Entra verificada. Registros anteriores continuam com nomes nulos; não há reconstrução fictícia do passado. O cursor distingue consultas com e sem entidades.

Operações em massa: a prévia percorre todas as páginas e informa a contagem integral da escola ou turma. Provas seladas vinculam ator, ação, escopo, contas, versões e validade de cinco minutos. A execução reutiliza os comandos individuais, com CAS e conferência da turma corrente na transação. Uma transferência invalida o item. Retentativas incertas preservam corpo e chave; o receipt não contém QR. Cancelamento interrompe os próximos itens e não desfaz os concluídos. O resultado é individual, não uma transação atômica para a escola inteira.

Segurança: o cliente usa o Durable Object existente com propósito `security`. Recebe apenas confirmação da conexão ou aviso mínimo de reautorização e consulta `/session` vinculada à conta exibida. Não consulta `/me` em resposta a eventos. Notas novas exigem atualização manual. Ao retornar do histórico, a página pede atualização manual após limpar conteúdo protegido.

Presença: número de alunos distintos com conexão de segurança recentemente autorizada, no escopo consultado. Abas duplicadas não aumentam o total. A janela é de 60 segundos; ping/pong hibernável não renova autorização. Suspensão abrupta de um dispositivo não é detectada instantaneamente. A interface consulta a contagem ao abrir ou por ação manual. Não há comprovação de custo gratuito ou de capacidade para 600 alunos.

Calendário: o fechamento da escola e sua janela de acesso são barreiras para turma e aluno. Overrides armazenados e sua procedência permanecem intactos. Jobs usam a interseção das janelas de acesso/divulgação, com início inclusivo e fim exclusivo, e revalidam antes de gravar a projeção. Nenhuma regra de cálculo acadêmico é recriada.

## Gates de publicação

As migrations candidatas 0016 e 0017 foram revisadas antes de entrar no código. Os testes usam bancos locais descartáveis e verificam ACL, rollback e concorrência; isso não significa que as migrations estejam aplicadas em produção.

A migration 0016 precisa preceder consultas com entidades. A migration 0017 precisa preceder o runtime que lê `security_relevant`. Não publicar uma combinação incompatível de schema e aplicação. Nenhuma permissão, secret ou proteção é alterada por esta recuperação.

Exigir `npm run verify`, PostgreSQL nativo, revisão independente, validação visual e gates oficiais no head final. Integração somente por merge commit e publicação pelo workflow oficial. Registrar SHA, ambiente e evidências finais no PR. Uma aba anterior ao deploy só incorpora o cliente de segurança ao recarregar uma vez. O endpoint acadêmico legado permanece compatível; o cliente novo não o utiliza para atualizar notas.

## Validação visual local (dados fictícios)

Prévia descartável em loopback (`127.0.0.1:4182`, Worker local + PostgreSQL nativo local, somente contas `SYNTHETIC`), Edge headless com a CSP administrativa real. Tráfego fora de loopback bloqueado.

- Desktop 1440 px: lista de alunos, ficha, QR atual, Políticas, Sessões e Auditoria renderizam sem erro de página.
- Clipboard: "Copiar imagem" grava PNG real 456×456 na área de transferência.
- Impressão: `print()` só é chamado após o CSS e a imagem carregarem; QR de 38 mm em A4 com margem de 5 mm.
- Operação em massa: prévia integral (18 contas no cenário) com confirmação desabilitada até a digitação da contagem.
- Mobile 390 px: sem rolagem horizontal da página; ficha ocupa a largura e não corta ações.

Defeitos encontrados e corrigidos nessa validação: CSS de impressão embutido como `data:` bloqueado por `style-src 'self'`; QR exibido/impresso via `blob:` bloqueado por `img-src 'self' data:` (a imagem aparecia vazia); prévia em massa sempre 403 porque o handler HTTP não elevava a capacidade de escrita exigida pela API; grade da ficha cortando conteúdo em telas estreitas.

## Aplicação em produção (22/09/2026)

Com autorização do responsável, após todos os gates oficiais verdes no head `a832a350`:

- Pré-condição conferida: `enqueue_portal_live_event_v1` e `enqueue_revision_live_event_v1` em produção eram idênticas às de 0011 (md5 do corpo). A 0017 só acrescenta `security_relevant`; o guarda de 2026 repete o `WHEN` já existente no trigger (0012). As colunas de 0016/0017 estavam ausentes.
- 0016 e 0017 aplicadas nessa ordem via Supabase CLI, cada uma em transação própria com `lock_timeout`/`statement_timeout`; histórico `20260922150000` e `20260922150001`.
- Pós-verificação: 4 colunas em `audit_event`, `live_event_outbox_v1.security_relevant` e o trigger `student_portal_capture_audit_entities_v1` presentes. Nenhuma permissão, secret ou proteção alterada. O runtime anterior continua compatível (somente colunas anuláveis/com default).
