# Fotos: integração final — #1119 / #1135

## Uso

As fichas administrativas e de desempenho usam o mesmo painel de foto. O
servidor resolve conta ou matrícula/ano para `studentUid`; nomes nunca são
chave de associação. O lápis abre o editor, a prévia final mostra o WebP
processado pelo servidor e Salvar confirma os dois enquadramentos. Ajustar
somente o avatar preserva a principal. Remover revoga a entrega privada e
acompanha a exclusão condicional no SharePoint; a lixeira não é apagamento
permanente. Concluir operação retoma um pedido pendente sem criar outro.

Em Alunos, no escopo Escola e com permissão de escrita, **Sincronizar fotos
existentes** percorre as contas autorizadas e prepara as cópias privadas do
acervo. Pode ser interrompido e repetido. Adoção não recorta, renomeia nem
reescreve originais. Ausência, publicação e pendência têm contagens separadas.
Uma falha não é apresentada como conclusão. Não é piloto nem nova coleta de
consentimento: o responsável confirmou autorização na matrícula.

## Entrega e limites

Principal 3×4 com fundo, avatar 1×1; sem remoção de fundo ou IA. Graph e codec
ficam somente no backend administrativo. O Portal recebe a principal pela
própria origem, para a sessão do próprio aluno e com `accessEnabled`/guardas
existentes. Erro de foto não encerra sessão nem impede consultar notas.
Sem foto, os círculos administrativos usam cor estável; o Portal não mostra
retrato. Não há polling, URL externa de imagem ou cache público.

As imagens novas passam pelo codec real; arquivos canônicos existentes são
decodificados para validação sem recompressão. O codec pré-compilado é
instanciado sem uma pausa assíncrona que rejeitaria cargas simultâneas como
ocupadas. A memória continua limitada e cada operação limpa seus buffers.

A CI compila a fonte fixada, executa a prova no Workerd, verifica hashes e a
árvore do aplicativo e entrega o mesmo artefato ao build administrativo.
O deploy conserva as verificações de dois pais, árvore exata e gates. Não
compila nem baixa o modelo em requisições; o navegador do aluno não recebe
WASM nem credenciais. O empacotamento real de Pages Functions é verificado.

## Implantação

Aplicar a sequência `migrations/student-photos/0001` a `0004` antes do deploy
que habilita as rotas. Não reaplicar a identidade 0018. Conferir schema,
RLS/ACL das tabelas/funções privadas, integridade das referências e preservação
dos cadastros/270 vínculos legados antes e depois. Não alterar contas, QR,
sessões ou notas para testar fotos. Permissões do conector Global Admin não
são prova das permissões da aplicação Graph usada pelo servidor.

A sincronização inicial usa sessão administrativa autorizada e mantém os
originais. Seus resultados no tenant e a validação de uso são evidências
separadas de build/CI. A issue registra exatamente o que foi aplicado,
publicado e conferido, sem transformar teste sintético em aceite real.

Roteiro de uso: abrir uma ficha com foto existente e outra sem foto; conferir
foto e círculos; ajustar avatar sem mudar a principal; substituir e cancelar
uma prévia; remover e conferir o Portal; testar retomada apenas se houver
operação real pendente. O responsável define os participantes e o momento,
sem uma versão técnica limitada por turma.
