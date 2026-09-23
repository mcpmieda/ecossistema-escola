# Gravação consistente das fotos — #1119

Esta entrega acrescenta o protocolo privado de escrita. Não monta endpoints, não
ativa as fotos, não aplica migrations e não liga o lápis às fichas. O decoder
servidor e os adaptadores Graph devem ser comprovados antes dessa composição.
Não há fallback que aceite um arquivo só pelo cabeçalho ou pela validação feita
no navegador. Remoção de fundo continua cancelada.

## Arquivos e responsabilidade

- `shared/student-photos/write-v1.ts`: contrato limitado das duas variantes,
  revisão esperada, identidade/operador, referências e fingerprint de entrada.
- `server/student-photos/write-repository-v1.ts`: transações PostgreSQL curtas,
  reservas por pessoa, compare-and-swap e recibos persistentes.
- `server/student-photos/write-coordinator-v1.ts`: validação obrigatória,
  uploads antes do commit, reconciliação de resposta perdida e limpeza posterior.
- `migrations/student-photos/0002_write_journal_v1.sql`: candidata; depende da
  candidata 0001 e da identidade 0018 já aplicada. Não reaplicar a 0018.

O contexto deve ser resolvido na autorização administrativa existente: operador,
conta/matrícula e studentUid não podem ser aceitos como autorização só porque
vieram no corpo do navegador. O coordenador exige autorização antes de validar
bytes e novamente antes de confirmar ou excluir. A rota produtiva futura deve
limitar corpo/tempo antes de materializar buffers. Os controles do SQL e os
contratos não substituem essa fronteira de acesso.

## Protocolo

1. Validar o pedido e decodificar/reencodar as variantes no servidor com um codec
   aprovado. Usar cópias próprias dos buffers. Principal até 128 KiB, 900x1200,
   proporção 3x4; avatar até 64 KiB, 320x320, quadrado. Não reduzir qualidade
   silenciosamente. Apenas variantes alteradas fazem parte do pedido.
2. Calcular o fingerprint canônico da saída validada, operador, pessoa, operação
   e revisão esperada. Reservar a pessoa numa transação curta. Uma segunda
   edição recebe conflito/ocupado; um retry idêntico recebe o mesmo recibo.
3. Enviar arquivos NOVOS por nomes derivados da operação e identidade. Não
   sobrescrever a família vigente. Um resultado ambíguo exige ler e verificar
   os bytes já armazenados naquela chave antes de repetir. Não inferir sucesso
   pelo tamanho, nome ou tempo decorrido.
4. Confirmar as novas referências em uma transação curta, verificando hashes,
   dimensões, tamanhos, arquivos novos e revisão/reserva. Atualização da família,
   recibo e auditoria são atômicas. A foto anterior permanece se falhar antes.
5. Excluir somente os arquivos aposentados após o commit. Uma falha de limpeza
   não desfaz a nova foto nem se torna exclusão concluída. O recibo mantém a
   lista pendente e a operação é retomada com a mesma chave.

A rede fica fora das transações. Locks têm limites explícitos. As reservas não
expiram automaticamente: expirar uma reserva enquanto um upload remoto ainda
pode terminar criaria duas operações concorrentes. Uma operação abandonada
exige reconciliação pelo fluxo autorizado, nunca desbloqueio cego por timeout.
Não há job/polling novo ou promessa de recuperação automática em background.

## Remoção e Portal

Remover limpa as referências vigentes e grava a revisão-túmulo antes do primeiro
DELETE remoto. Isso impede leituras novas enquanto o SharePoint está fora e
rejeita edições baseadas numa foto já removida (inclusive revisão nula antiga).
A operação permanece pendente enquanto os arquivos não tiverem resultado.

O trigger privado `revoke_changed_portrait_v1` só zera bytes e registra revogação
na cópia do Portal quando a principal muda ou a família é removida. Não concede
à aplicação permissão para aprovar, autorizar ou inserir bytes no Portal.
Editar apenas o avatar preserva a principal e sua cópia aprovada, sem reencodar.
O trigger é SECURITY DEFINER estritamente de revogação, com search_path fixo,
sem parâmetros públicos e sem EXECUTE para runtime/Data API.

O retorno de ausência do arquivo no drive ativo é auditado separadamente de
exclusão confirmada. Ausência não é prova de expurgo da lixeira ou das cópias
sujeitas à retenção. Não contornar bloqueios, ETags ou retenção.

## Persistência e restauração

O schema adiciona família vigente, recibos por operação e auditoria sem bytes
ou respostas Graph. Não migra o acervo legado nem modifica profile_photo.
`gradebook_app` tem acesso privado delimitado ao novo estado/recibos e INSERT/
SELECT na auditoria; não tem UPDATE/DELETE de auditoria, TRUNCATE nem escrita
na cópia do Portal. Os clientes Data API e o papel do Portal não recebem acesso
a esses controles. RLS habilitado em todas as tabelas novas.

A adoção inicial das referências legadas deve ser parte da integração seguinte,
com identidade e propriedade dos arquivos conferidas. Não inicializar um aluno
com família vazia e apagar/republicar seu acervo por suposição. O contrato ainda
não oferece cancelamento de um upload já enviado nem recuperação por outro
operador; esses caminhos exigem reconciliação explícita da operação original.

Restore futuro deve preservar as revisões, reservas e recibos junto às famílias.
Um snapshot do banco não restaura arquivos já eliminados do SharePoint. Antes de
reabrir escrita após restore, reconciliar cada operação pendente e verificar os
arquivos; não executar a fila antiga de limpeza automaticamente.

## Evidência exigida

Os testes nativos novos usam PostgreSQL descartável e roles restritos reais:
concorrência entre dois escritores, retries idênticos, payload/operador/pessoa
incompatíveis, preservação antes do commit, revogação transacional, avatar
isolado, resposta perdida após commit, limpeza pendente, audit append-only e
revisão-túmulo. Referências e imagens são exclusivamente sintéticas.

O teste do coordenador injeta um codec sintético para isolar o protocolo. NÃO é
prova de decodificação real no Worker. Fonte de verdade dos testes executados,
SHA, revisão e deploy: issue/PR. Nenhuma autorização institucional de imagem ou
permissão Graph efetiva é inferida desta entrega. As fotos seguem desativadas.
