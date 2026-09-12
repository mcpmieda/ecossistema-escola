# Especificação operacional — v3.0 + Adendo 01

Fontes: PORTAL_DO_ALUNO_ESPECIFICACAO_CANONICA_v3.0 e PORTAL_DO_ALUNO_ADENDO_CANONICO_DECISOES_E_PLANEJAMENTO_P1_v1.0, entregues pelo responsável e lidos integralmente na auditoria. O Adendo prevalece nas substituições explícitas. O comando de planejamento não autorizou implementação; a autorização posterior nomeou somente #702. O Word não é autorização operacional independente.

## Requisitos vigentes P1

- PostgreSQL/Supabase, schema student_portal separado de gradebook; role mínima própria e PORTAL_DB sem cache. Nada de D1/KV/store local como autoridade ou fallback. Sem novo plano, NS, permissões Entra, reset acadêmico ou divulgação pública por consequência do deploy.
- Conta UUID permanente, vínculo composto com aluno/ano 2026. QR é credencial separada. Nome/turma/situação são do BN. Não usar CPF/INEP, nome, hash externo, diretório/aliases ou relatório paralelo para identidade. Ano 2025/2027 é recusado no Portal V1.
- Uma conta por referência acadêmica; situação NOVATO/null regular; 1 especial e 2 assistido elegíveis, 3 desistente/4 transferido/5 falecido encerram acesso, 6 FOI PARA é histórico, 7 ESTAVA NO pode ser corrente. Situação ambígua não autoriza acesso. Corrente resolvido pelo BN vence histórico, nunca dois logins. Relação nova cria perfis idempotentes; retorno mesmo ID preserva conta mas não restaura sessões revogadas/bloqueio administrativo. Novo ID não religa pelo nome.
- Troca de turma conserva QR/senha/nascimento e muda herança/escopo. Saída prevalece imediatamente sobre sessão/projeção antiga mesmo com fila atrasada. Guard do reset deve estar publicado antes de qualquer população de vínculo Portal.
- Nascimento é somente ano em student_portal; quatro dígitos completos, faixa técnica V1 1900…2026. Ausente/incompleto não é valor zero. Autosave usa CAS; limpar é comando explícito. Lote até100 itens, sem duplicatas, resultado por item. Teste fictício sempre unconfirmed-test; não promove confirmação automaticamente. Confirmado é estado de procedência administrativa, não criptografia nem identidade universal.
- Correção atualiza cadastro/verificador/versão PIN e invalida desafios antigos atomicamente; mantém senha, QR e sessões. Limpeza mantém senha ativa, desabilita fluxos dependentes PIN. Credenciais nunca guardam nascimento/PIN/senha em texto. Auditoria não registra valor de nascimento.
- Primeiro acesso: QR+PIN4 → desafio opaco de uso único → senha6+confirmação → sessão após commit. Ativa não aceita PIN no login cotidiano. Senhas estritamente ASCII numéricas, inclusive zero inicial. Senha nunca é definida pelo operador. KDF+salt+pepper é obrigatório; algoritmo/parâmetros só após benchmark no Worker #711/#714, sem SHA simples ou redução silenciosa.
- Reprint recria mesmo QR; regenerar cria outro QR na mesma conta, revoga sessões, conserva senha. Reset senha conserva QR e invalida senha/sessões. Reset conta muda QR, invalida senha/sessões e retorna ativação, preservando conta/nascimento/história. Nenhuma dessas ações desvincula aluno nem autoriza reset anual.
- Sessão opaca aleatória server-side hashed, cookie exclusivo Secure/HttpOnly/SameSite=Strict/Path=/ sem Domain. KeepConnected default de produto true; request exige escolha explícita. Defaults aprovados30 dias e12 horas, cap no fim do ano. Sem keepConnected: cookie sem Max-Age/Expires, validade servidor12h. Bloqueio/regeneração/reset/logout/saída revogam no banco e próxima requisição consulta estado fresco. Browser restore não garante logout ao fechar janela.
- Defaults de risco: desafio após3 falhas; bloqueio após5 por15 min, editáveis. Janela15 min e TTL desafio5 min são escolhas técnicas desta versão, não novas decisões do responsável. Contagem transacional por conta/credencial, nunca só IP; sucesso/reset autorizado encerra janela daquela conta, não desbloqueia outra. Tentativa durante bloqueio não estende indefinidamente bloqueio. Sem timeout adicional de inatividade nesta V1; expiração absoluta e revogação continuam obrigatórias. Expiração libera janela nova; desafio de risco não autentica aluno. Limitação de borda complementa PG; NAT escolar não é identidade. Siteverify valida token, hostname, action e replay; indisponibilidade falha fechada quando desafio exigido.
- Configurações escola→turma→aluno. Ausência de override herda; false/[] são valores explícitos. Cada campo de topo tem origem/versionamento; risk e calendar são objetos atômicos de override, sem misturar calendários parciais de escopos. Remover override devolve herança. Escola deve possuir defaults completos; herdar no topo é erro administrativo, nunca política permissiva.
- Calendário: enrollmentStartsAt, yearStartsAt (=inícioT1), t1EndsAt/t2EndsAt/t3EndsAt, recoveriesStartAt, yearEndsAt, finalDisclosureAt, disclosure. Fuso America/Sao_Paulo; timestamps RFC3339 com offset, instantes UTC na persistência; precisão em segundos. Início inclusivo, fim exclusivo; instante de fim é a primeira hora proibida. Datas não são presumidas31/12. Campos nulos são rascunho: somente operação dependente indisponível. Modo single (at+períodos abrangidos) ou per-period com seis datas; modo inativo não mantém job. Datas passadas/efeito imediato exigem confirmação. Ordem dos marcos principais validada; data final própria não é inventada.
- Matrícula é marco administrativo de cadastro e não impede a sincronização técnica dos perfis após Relação; ano/T1 inicia período, fins delimitam encerramento, recuperações marcam disponibilidade, disclosure autoriza agendamento dos períodos selecionados, finalDisclosureAt limita resultado final, yearEndsAt limita sessão. Datas não importam alunos nem publicam dados inexistentes. Mudar calendário não desfaz publicação confirmada automaticamente nem reativa revogação; versões/jobs obsoletos são invalidados, e política vigente continua governando leitura.
- Publicar é separado de importar. T1/T2/T3/REC1/2/3 independentes; somente finais ou finais+parciais; oculto nem chega no payload. AutoUpdateON atualiza apenas período já publicado. OFF mantém versão anterior e oferece publicar atualização com revisão exata aprovada. Se fonte mudou e revisão alvo não está disponível, conflito, jamais promoção silenciosa da revisão mais nova.
- Resultado final defaultOFF. ON+data/política+fonte oficial+aluno autorizado são necessários. Regular EM CURSO enquanto não divulgado; ASSISTIDO não recebe resultado global inventado. AM/U e R/R e Conselho são autoridade BN; native-engine descritivo não substitui imported-source. Zero, ausente, N/C e R/R são estados distintos. REC não aplicável não aparece; publicada/aplicável sem nota tem marcador. Nota/máximo/indicação de atingir mínimo vêm da autoridade, não cálculo do Portal.
- Projeção durável pequena por aluno/ano e revisões de dados/política/publicação; sem consulta da turma inteira/N+1 por acesso. Nenhuma fórmula/peso/evidência/nome de professor/terceiro. Nova versão falha preserva a anterior apenas se ainda autorizada. Fila durável PG idempotente com claim/lease/retry; cron é disparador, não autoridade. Mudanças de Relação/notas/Conselho/config acadêmica têm revisão transacional antes do commit, inclusive flushV11.
- ADM usa sessão Entra atual no servidor e capability platform.settings.read/write para leitura/mutação Portal (ADMINISTRADOR atual). PORTAL_SERVICE nomeado só alcança entrypoint administrativo privado. Nenhum contexto/role enviado no browser confere acesso. Self deriva conta/ano da sessão; URL/body não amplia escopo.
- API ADM completa: contas/primeiro acesso/filtros/turma; QR emissão/reprint/regenerate/lote; reset senha/conta; bloquear/desbloquear; sessões individual/conta/turma; nascimento; configurações/herança; publicação; auditoria; saúde; preview/encerramento de vínculos. Confirmação+CAS+idempotência em mutações. Sem interface P2 nesta entrega.
- Reset opção A: qualquer vínculo Portal bloqueia preview/execute BN, inclusive conta bloqueada. Operação própria Portal de encerramento/desvinculação usa preview, contagem, token curto, confirmação, CAS, locks e tombstone; preserva história e impede repopulação automática. FK sem cascade é defesa adicional. Só depois ausência de vínculos pode permitir reset BN explícito. Nenhum reset real em teste.
- QR no formato URL mesma origem/rota, credencial e HMAC no fragmento para evitar access-log; client futuro extrai localmente e faz POST. Assinatura/chaves nunca no browser. Credencial aleatória32 bytes e HMAC-SHA256 com chave versionada; sal/sessão/desafio aleatórios independentes. Não reimprimir com chave perdida nem aceitar assinatura ausente. QR é entregue só na operação privada de impressão autorizada, nunca lista/auditoria/token em texto no PDF.
- Três modos PDF: QR-only, QR+nome, QR+nome+turma default. Backend entrega DTO limitado; câmera/fallback/imagemlocal/PDF/impressão física são P2. Sem enviar foto ao servidor só para detectar QR; sem analytics terceiros, persistência de notas em storage/browser cache ou service worker. No-store nos dados protegidos.
- IP bruto máximo90 dias, metadados12 meses; lista mascarada, detalhe autenticado só dentro da retenção. Sem nota/nome/nascimento/PIN/senha/QR/URL-token em logs/screenshots/fixtures públicas. Métricas técnicas sanitizadas. Cleanup bounded/retry não substitui verificação de expiração.
- 2026/6A é teste privado autorizado, não distribuição/abertura geral. Mutações destrutivas só PG sintético descartável. Backup gerenciado/RPO/RTO pós-entrega; rollback de código/schema aditivo, integridade, chaves e prevenção de reativação após restore são obrigações P1.

## Memória completa D-001…D-097

As linhas abaixo preservam a decisão de origem para rastreabilidade, não reintroduzem texto substituído. O status identifica exatamente as substituições do Adendo. Decisões visuais mantidas são requisitos posteriores, sem issues P2 nesta entrega.

| ID | Texto de origem | Status operacional |
|---|---|---|
| D-001 | Portal construído dentro do ecossistema-escola e integrado ao Centro de Administração. | Mantida; aplicar requisitos vigentes acima. |
| D-002 | Domínio alvo aluno.escolaieda.com; Worker/origem/TLS/configuração próprios em P1-03. | Mantida; aplicar requisitos vigentes acima. |
| D-003 | HeroUI React v3 é obrigatório; HeroUI Pro pode e deve ser usado conforme referências/diretrizes quando aderente. | Mantida; aplicar requisitos vigentes acima. |
| D-004 | Apresentação visual é requisito de produto; evitar áreas brancas mortas, excesso de cor e elementos decorativos sem função. | Mantida; aplicar requisitos vigentes acima. |
| D-005 | Ícones pequenos/médios e funcionais. | Mantida; aplicar requisitos vigentes acima. |
| D-006 | Portal inicial sem menu lateral; shell preparado para evolução futura. | Mantida; aplicar requisitos vigentes acima. |
| D-007 | Header: logo à esquerda; ao centro PORTAL DO ALUNO na 1ª linha e NOME DA ESCOLA na 2ª; Sair à direita. | Mantida; aplicar requisitos vigentes acima. |
| D-008 | Primeira seção é Perfil do aluno; segunda é Minhas notas. | Mantida; aplicar requisitos vigentes acima. |
| D-009 | Foto real é pós-produto; V1 usa Avatar colorido com iniciais. | Mantida; aplicar requisitos vigentes acima. |
| D-010 | Tabela anual na mesma superfície; sem subguias por disciplina. | Mantida; aplicar requisitos vigentes acima. |
| D-011 | Disciplina sticky; ScrollShadow sinaliza continuidade; resizing desktop quando útil. | Mantida; aplicar requisitos vigentes acima. |
| D-012 | Modo de conteúdo: somente finais OU finais + parciais. | Mantida; aplicar requisitos vigentes acima. |
| D-013 | Parciais ficam dentro da célula do trimestre; I/II Avaliação e até 10 atividades com descrição do professor. | Mantida; aplicar requisitos vigentes acima. |
| D-014 | Aluno nunca vê termos internos quantitativo/qualitativo, fórmulas, pesos ou evidências. | Mantida; aplicar requisitos vigentes acima. |
| D-015 | Parcial mostra valor obtido / valor total; valor obtido em maior destaque. | Mantida; aplicar requisitos vigentes acima. |
| D-016 | Cor da nota: azul se atinge mínimo institucional, vermelho se abaixo; mínimo vem do perfil do Banco, nunca hardcoded. | Mantida; aplicar requisitos vigentes acima. |
| D-017 | Ausência de nota nunca vira zero. | Mantida; aplicar requisitos vigentes acima. |
| D-018 | T1/T2/T3 e REC T1/T2/T3 só existem visualmente se publicados. | Mantida; aplicar requisitos vigentes acima. |
| D-019 | Aluno sem recuperação não vê bloco/colunas REC; REC sem nota usa Chip REC quando publicado/aplicável. | Mantida; aplicar requisitos vigentes acima. |
| D-020 | Resultado final permanece bloqueado até contrato de divulgação estudantil e aceite de autoridade; a existência de Conselho/Boletins no Banco não o publica automaticamente. | Complementada/substituída AD-04…07: calendário e risco configuráveis, final condicionado. |
| D-021 | Configuração herda Escola -> Turma -> Aluno; regra mais específica prevalece e UI mostra origem do valor efetivo. | Mantida; aplicar requisitos vigentes acima. |
| D-022 | Controle de acesso pode liberar/bloquear escola, turma ou aluno. | Mantida; aplicar requisitos vigentes acima. |
| D-023 | Atualização automática de períodos já publicados é configurável. | Mantida; aplicar requisitos vigentes acima. |
| D-024 | Auto-update desligado preserva versão anterior e oferece Publicar atualização para promover o estado atual. | Mantida; aplicar requisitos vigentes acima. |
| D-025 | Percentual acadêmico não é configuração do Portal; pertence ao Banco/perfil acadêmico. | Mantida; aplicar requisitos vigentes acima. |
| D-026 | Centro ADM: guias principais no topo; Configurações com sidebar esquerda e pesquisa própria, inspirada no HeroUI Pro Email Template. | Substituída: navegação ADM atual; sem reforma topo/sidebar. |
| D-027 | Biblioteca visual e matriz de referências são requisitos; agente não substitui referência específica por padrão genérico sem justificativa. | Mantida; aplicar requisitos vigentes acima. |
| D-028 | Correspondência começa por turma e nome; se não bater, busca mesmo nome em toda a escola e pede confirmação. | Substituída AD-01/02: vínculo direto BN/2026, sem fonte externa. |
| D-029 | Mesmo nome/turma pode ser pessoa diferente; operador pode confirmar ou rejeitar vínculo. | Substituída AD-01/02: vínculo direto BN/2026, sem fonte externa. |
| D-030 | Data de nascimento pode auxiliar conflitos de identidade, mostrando somente dados necessários. | Substituída AD-01/02: vínculo direto BN/2026, sem fonte externa. |
| D-031 | Vínculos confirmados/rejeitados persistem entre reimportações. | Substituída AD-01/02: vínculo direto BN/2026, sem fonte externa. |
| D-032 | Relatório é idempotente por SHA-256; arquivo idêntico não duplica trabalho. | Substituída AD-01/02: vínculo direto BN/2026, sem fonte externa. |
| D-033 | Hash oficial deve ser fornecido antes da identidade funcional e validado quanto a unicidade/estabilidade. | Substituída AD-01/02: vínculo direto BN/2026, sem fonte externa. |
| D-034 | Não improvisar identidade definitiva com CPF/INEP/outros campos. | Mantida; aplicar requisitos vigentes acima. |
| D-035 | Conta nasce somente para aluno com identidade confirmada. | Substituída AD-01/02: vínculo direto BN/2026, sem fonte externa. |
| D-036 | Conta do aluno é permanente; QR é apenas uma chave/credencial da mesma conta. | Mantida; aplicar requisitos vigentes acima. |
| D-037 | Na V1 existe um único QR ativo por conta. | Mantida; aplicar requisitos vigentes acima. |
| D-038 | QR usa credentialId aleatório, versão e assinatura HMAC; PostgreSQL guarda metadados; Secrets guarda chaves; payload completo não persiste em claro. | Mantida; aplicar requisitos vigentes acima. |
| D-039 | Reimpressão reconstrói o mesmo QR atual a partir de credentialId/keyVersion/assinatura. | Mantida; aplicar requisitos vigentes acima. |
| D-040 | Regenerar QR troca apenas a chave; não redefine senha, primeiro acesso, identidade ou histórico. | Mantida; aplicar requisitos vigentes acima. |
| D-041 | Copiar QR copia somente a imagem do QR, sem nome, turma, escola ou instruções. | Mantida; aplicar requisitos vigentes acima. |
| D-042 | PIN = ano de nascimento, 4 dígitos; usado no primeiro acesso e após redefinir senha/conta. | Mantida; aplicar requisitos vigentes acima. |
| D-043 | PIN e senha pertencem à conta e não são vinculados a um QR específico. | Mantida; aplicar requisitos vigentes acima. |
| D-044 | Primeiro acesso: QR + PIN → criar senha numérica de 6 dígitos → confirmar → conta ativa. | Mantida; aplicar requisitos vigentes acima. |
| D-045 | Próximos acessos: QR + senha; Manter conectado vem marcado. | Mantida; aplicar requisitos vigentes acima. |
| D-046 | Redefinir senha mantém QR; invalida senha/sessões; reabre PIN; exige nova senha + confirmação. | Mantida; aplicar requisitos vigentes acima. |
| D-047 | Redefinir conta revoga QR, gera novo QR, invalida senha, encerra sessões e retorna ativação; mantém PIN, identidade e dados. | Mantida; aplicar requisitos vigentes acima. |
| D-048 | Não bloquear paste na confirmação de senha; apenas validar igualdade. | Mantida; aplicar requisitos vigentes acima. |
| D-049 | Sessões server-side; cookie seguro; logout/revogação; encerramento individual, todas e por turma. | Mantida; aplicar requisitos vigentes acima. |
| D-050 | Prazo de sessão é configurável e não ultrapassa fim oficial do ano letivo para estados elegíveis; datas oficiais vêm do Banco. | Complementada/substituída AD-04…07: calendário e risco configuráveis, final condicionado. |
| D-051 | Transferido/desistente/falecido e estados equivalentes encerram sessões conforme mapa de Situações do aluno. | Mantida; aplicar requisitos vigentes acima. |
| D-052 | Mudança interna de turma preserva conta/histórico; mapear “estava em / foi para”. | Mantida; aplicar requisitos vigentes acima. |
| D-053 | QR em massa: opções Somente QR / QR+nome / QR+nome+turma; padrão QR+nome+turma. | Mantida; aplicar requisitos vigentes acima. |
| D-054 | PDF pode baixar diretamente quando pronto; preview não é obrigatório. | Mantida; aplicar requisitos vigentes acima. |
| D-055 | Leitor QR aceita câmera e imagem local; encontra QR dentro de imagem maior; câmera traseira preferencial com troca frontal. | Mantida; aplicar requisitos vigentes acima. |
| D-056 | Aluno nunca consulta planilha diretamente; Portal consome resultados oficiais resolvidos pelo Banco. | Mantida; aplicar requisitos vigentes acima. |
| D-057 | Publicação não é importação; existência no PostgreSQL não implica divulgação. | Mantida; aplicar requisitos vigentes acima. |
| D-058 | Projeção publicada compacta/self/versionada é o caminho normal de leitura. | Mantida; aplicar requisitos vigentes acima. |
| D-059 | Falha de nova atualização não apaga versão publicada válida; problemas são localizados. | Mantida; aplicar requisitos vigentes acima. |
| D-060 | Sem full scan de turma/nome no login; consultas self indexadas; zero N+1. | Mantida; aplicar requisitos vigentes acima. |
| D-061 | Sem armazenamento acadêmico persistente no browser; sessão via cookie/server-side. | Mantida; aplicar requisitos vigentes acima. |
| D-062 | IP de acesso é logado: bruto até 90 dias; depois apagar/anonimizar; demais metadados 12 meses. | Mantida; aplicar requisitos vigentes acima. |
| D-063 | IP não é identidade nem bloqueio automático isolado. | Mantida; aplicar requisitos vigentes acima. |
| D-064 | Logs não contêm nota, PIN, senha, nascimento ou QR completo. | Mantida; aplicar requisitos vigentes acima. |
| D-065 | Administração herda autorização server-side do Centro ADM; política/grupo real é verificado e o transporte até o Portal é privado. | Mantida; aplicar requisitos vigentes acima. |
| D-066 | Mapa de primeiro acesso mostra quem nunca ativou e quem já entrou. | Mantida; aplicar requisitos vigentes acima. |
| D-067 | Foto/armazenamento de imagem é pós-produto. | Mantida; aplicar requisitos vigentes acima. |
| D-068 | P1-01 fixa arquitetura, contratos, inventário e grafo P1/P2. Pendências conhecidas têm escopo e owner; agente não as decide silenciosamente. | Mantida; aplicar requisitos vigentes acima. |
| D-069 | Exceção arquitetural somente para omissão estrutural real: hard stop, docs/contracts primeiro, depois código. | Mantida; aplicar requisitos vigentes acima. |
| D-070 | P1-03 prepara runtime Cloudflare próprio, Hyperdrive sem cache e integração privada antes de declarar backend real pronto. | Mantida; aplicar requisitos vigentes acima. |
| D-071 | G-C congela contratos/fixtures/ownership; G-B valida backend; G-P libera produção após o piloto autorizado de P2-08. Substituem o gate G1 da v2. | Mantida; aplicar requisitos vigentes acima. |
| D-072 | O grafo declara depende de, pode correr em paralelo com fixtures e integra depois. Publicação real exige gates operacionais. | Mantida; aplicar requisitos vigentes acima. |
| D-073 | Paralelismo por entregas P1/P2 independentes e predefinidas após G-C; uma issue/branch/PR por entrega, sem subagentes. | Mantida; aplicar requisitos vigentes acima. |
| D-074 | Cada handoff informa SHA, contratos, teste, main, deploy, pendências e próxima tarefa; docs atualizadas no mesmo ciclo. | Mantida; aplicar requisitos vigentes acima. |
| D-075 | Ferramenta de execução depende da capacidade necessária; ambiente real/auth/câmera/print exige autorização e evidência própria. | Mantida; aplicar requisitos vigentes acima. |
| D-076 | Produto pronto não depende de D1/KV como fonte de estado, store local, adapter de preview, flag esquecida ou passo técnico manual repetitivo. | Mantida; aplicar requisitos vigentes acima. |
| D-077 | Rede social futura é apenas restrição arquitetural; não entra no escopo inicial. | Mantida; aplicar requisitos vigentes acima. |
| D-078 | PostgreSQL/Supabase é a fonte de verdade persistente do Portal; Cloudflare permanece runtime/segurança/conectividade. | Mantida; aplicar requisitos vigentes acima. |
| D-079 | Usar student_portal no mesmo PostgreSQL de gradebook, com fronteiras e privilégios separados. | Mantida; aplicar requisitos vigentes acima. |
| D-080 | PORTAL_DB é binding próprio, papel mínimo e cache desativado; não é credencial compartilhada com PROD_DB. | Mantida; aplicar requisitos vigentes acima. |
| D-081 | D1 e KV não são persistência, fallback ou espelho de autenticação/publicação do Portal. Legado acadêmico é tratado separadamente. | Mantida; aplicar requisitos vigentes acima. |
| D-082 | Worker estudantil isolado; Centro ADM chama entrypoint privado por PORTAL_SERVICE, sem compartilhar cookie. | Mantida; aplicar requisitos vigentes acima. |
| D-083 | Portas novas são PostgreSQL nativas; não adicionar facade D1 ao Portal nem reescrever contratos BN dentro de [PA]. | Mantida; aplicar requisitos vigentes acima. |
| D-084 | QR/PIN/senha/reset/sessões e auditoria usam transações e controle de concorrência por conta. | Mantida; aplicar requisitos vigentes acima. |
| D-085 | HMAC/pepper/chaves ficam fora do banco; apenas verificadores/metadados/hashes persistem em PostgreSQL. | Mantida; aplicar requisitos vigentes acima. |
| D-086 | Sessão estudantil é opaca e revogável; não copiar a sessão selada Entra como mecanismo estudantil. | Mantida; aplicar requisitos vigentes acima. |
| D-087 | Publicação é estado durável versionado, não cache; despublicação e alteração de política prevalecem sobre versão anterior. | Mantida; aplicar requisitos vigentes acima. |
| D-088 | Jobs de publicação/limpeza são duráveis, idempotentes e limitados; não depender apenas de waitUntil ou memória. | Mantida; aplicar requisitos vigentes acima. |
| D-089 | A V1 integra o ano 2026 do baseline atual; outro ano depende de contrato e decisão explícitos. | Mantida; aplicar requisitos vigentes acima. |
| D-090 | Separar AM/U oficiais, cálculo descritivo e decisão humana; DTO estudantil jamais infere resultado final. | Mantida; aplicar requisitos vigentes acima. |
| D-091 | Desenvolvimento dividido em Parte 1 backend e Parte 2 produto; G-C permite front sintético independente, G-B permite integração, G-P libera produção após o piloto autorizado. | Mantida; aplicar requisitos vigentes acima. |
| D-092 | Excluir branches de entrega depois do merge, preservando commits/handoff e corrigindo dependências antes da exclusão. | Mantida; aplicar requisitos vigentes acima. |
| D-093 | Atualizar docs/estado no mesmo ciclo, com um integrador para arquivos centrais e estados main/deploy/smoke distintos. | Mantida; aplicar requisitos vigentes acima. |
| D-094 | Maximizar cobertura útil de testes; testar falhas, concorrência, ACL, câmera, impressão e recuperação, não apenas casos felizes. | Mantida; aplicar requisitos vigentes acima. |
| D-095 | A pendência de identidade/hash permanece em H-01 e deve ser resolvida antes da ativação de contas reais. | Substituída AD-01/02: vínculo direto BN/2026, sem fonte externa. |
| D-096 | RPO/RTO e política de recuperação de chaves/sessões precisam de decisão e ensaio; D1 não serve como backup do novo estado. | Substituída: backup gerenciado/RPO/RTO pós-entrega; integridade imediata. |
| D-097 | A arquitetura canônica não é declaração de implementação pronta; fatos verificados e lacunas têm rótulos/evidências próprias. | Mantida; aplicar requisitos vigentes acima. |
