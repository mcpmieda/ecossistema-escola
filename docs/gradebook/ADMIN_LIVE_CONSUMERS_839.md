# Consumo administrativo e proteção de edição — pacote #839

> **Checkpoint histórico da #839.** A #839 foi encerrada por consolidação em 20/09/2026. O estado operacional atual está em [LIVE_RESILIENCE_CURRENT_970.md](LIVE_RESILIENCE_CURRENT_970.md), #970/B-21 e #968/P-12. Frases abaixo como “não encerrar #839” registram o estado daquela entrega e não são instrução vigente.

Continuação de PR840 e PR841, sem novo endpoint/contrato público, schema, ACL, regra acadêmica ou infraestrutura. Este documento descreve implementação; resultados efetivos dos gates e publicação ficam na PR.

## Canal único no Centro

O App autenticado possui o canal administrativo já existente. Banco e Painel do Aluno usam a mesma conexão por documento. O Painel isolado mantém seu modo anterior, sem abrir uma segunda conexão sob o proprietário do App. Identidade, expiração e permissões delimitam o canal apenas em memória; não geram novas permissões.

O transporte limita a conexão sem mensagem válida a 10 segundos e reconecta com espera progressiva até 30 segundos mais dispersão. Abrir TCP não prova que os avisos funcionam. Negação 4401/4403 é terminal naquele escopo, sem repetição infinita; o App confere /api/me. Fallback de leitura continua. Troca de identidade/expiração/permissões reinicia o escopo de conexão; troca de identidade/permissões remove a tela anterior. Offline/aba oculta fecha o canal, retorno respeita cooldown. Change repetido é deduplicado por domínio/cursor; resync nunca é suprimido. Avisos remotos não voltam ao BroadcastChannel das outras abas que já recebem seus avisos; comandos locais mantêm o broadcast mínimo.

## Identidade e rascunhos

O código de /api/me foi extraído do App para um hook testável. Usa o mesmo endpoint e dados existentes, no-store, prazo incluindo o corpo da resposta, descarte de resposta antiga e limpeza de listeners/temporizadores. Rechecagem é ligada a retorno, prazo de sessão e negação do canal, não a um polling novo. Falha transitória preserva somente a identidade ainda válida; expiração conhecida ou 401/403 remove conteúdo. Pagehide remove conteúdo antes de restaurar uma página do histórico. A API continua autorizando cada leitura e comando.

Os formulários que já usam o guard de navegação observam avisos mínimos. Um aviso enquanto há edição mostra “Há atualizações a conferir”, sem afirmar que o aluno específico mudou. O guard armazena somente tokens anônimos; não muda valor, expectedVersion, confirmação ou idempotência. Concluir/descartar a edição ou desmontar o escopo limpa sua indicação. O backend e os controllers existentes continuam responsáveis pelo conflito real. Não há bloqueio pessimista nem replay automático de gravação nesta mudança.

## Recuperação periódica: sem redução indiscriminada

A proposta intermediária de aplicar 120 segundos a todas as áreas foi retirada antes da integração. Apenas Analytics V6 mantém sua redução explícita já entregue na PR840. Os demais leitores preservam a cadência anterior, incluindo Conselho, publicação temporal, segurança, credenciais e catálogo. O contexto aceita uma futura cadência declarada por área, com precedência do leitor explícito, mas esta entrega não ativa esse recurso nas outras áreas.

Todas as áreas retidas continuam com pausa do scheduler quando ocultas, conforme PR840. Abertura, seleção de contexto e eventos continuam sendo caminhos de atualização. Socket conectado não comprova cobertura dos produtores. Não se promete polling zero nem atualização instantânea entre computadores.

## Cobertura e verificações

A outbox existente deriva de revision_event e de uma lista explícita de audit_event do Portal, limitada ao ano de 2026. Não cobre toda escrita SQL direta, toda passagem do relógio ou todos os estados administrativos. Nem toda operação do Banco chama drain imediato; existe recuperação pelo cron. Manter fallback até mapear e testar cada produtor/consumidor relevante.

Testes desta entrega cobrem um proprietário com vários consumidores, StrictMode, troca de identidade, deadline do handshake, reconexão, hidden/offline, negação, deduplicação sem eco, avisos de edição, versão preservada, cleanup e rechecagem da identidade. Testes existentes de CAS, calendário, publicação, snapshot, lista contínua e auth permanecem. Provas sintéticas não substituem dois computadores reais autenticados, homologação visual ou uma aba atravessando um deploy.

O pacote ainda exige inventário final dos produtores, confirmação operacional da drenagem, evidência de publicação e diagnóstico persistente do frontend. Não encerrar #839 nem atribuir a esta entrega a descoberta da causa do timeout original às 12:54 BRT. Índices/cache/infra permanecem condicionais e fora destas alterações.
