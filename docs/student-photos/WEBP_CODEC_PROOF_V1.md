# Codec WebP — prova isolada v1 (#1119)

## Estado e fronteira

Candidato independente da #1123, baseado na main 14043e91. Não monta uma rota de
upload, não altera o head validado da #1123 e não resolve/contorna o bloqueio de
merge. Não acessa SharePoint, Supabase, fotos reais, credenciais ou produção.
Não fecha a #1119. As evidências de execução pertencem ao SHA e ao run registrados
na PR; a presença destes arquivos não significa que a prova passou.

## Fonte e ferramenta

- libwebp v1.6.0: commit `4fa21912338357f89e4fd51cf2368325b59e9bd9`, da tag
  `v1.6.0` no espelho oficial https://github.com/webmproject/libwebp.
- Emscripten 4.0.15: instalador emsdk no commit
  `389a68bc35dcff7ebae4614e1615099dafda00d1` de
  https://github.com/emscripten-core/emsdk.
- A compilação recusa checkout modificado/commit diferente e outra versão de emcc.
  Registra SHA-256 do módulo, bridge e script, além do commit da aplicação.
- `COPYING`, `PATENTS` e `AUTHORS` do upstream acompanham o artefato. A distribuição
  deve preservar esses avisos; o formato WebP e o código da escola não são a mesma licença.
- Fonte identificável e versão executada não são declaração de ausência de
  vulnerabilidades, verificação de assinatura PGP ou build reproduzível entre
  máquinas. Antes da adoção produtiva, revisar avisos e correções upstream atuais,
  inclusive posteriores à release, e fixar a política de atualização do artefato.

A release contém o histórico de correções em `NEWS`. O pacote pré-compilado
@jsquash/webp investigado antes não é instalado nem usado nesta prova. Não há
nova dependência npm ou serviço externo de processamento.

## Comportamento

`StudentWebpCodecV1` recebe um `WebAssembly.Module` previamente compilado/importado.
Não faz fetch, compilação dinâmica, filesystem, threads ou chamada Graph durante
uma imagem. O chamador precisa manter uma instância do adaptador por isolate:
apenas uma operação admitida, sem fila ilimitada, com instância WASM nova por operação.

A pré-inspeção reutiliza o probe existente, mas não serve como validação final.
O bridge decodifica todos os pixels com `WebPDecodeRGBAInto`, verifica opacidade e
reencoda com `WebPEncode`. Mantém largura/altura, sem ampliar, recortar ou reduzir.
Qualidade 92, 86 ou 80 é obrigatória e explícita, sem default, target-size ou retry
com qualidade menor. O escritor C limita os bytes ainda durante a codificação:
principal 128 KiB; avatar 64 KiB. Saída excedente é descartada e rejeitada.

Entrada deve ser WebP estático já orientado pelo editor. Não aceitar JPEG/PNG nesta
fronteira de upload; eles continuam fontes do editor local. EXIF, XMP, ICC e chunks
extras são rejeitados, não ignorados silenciosamente. Transparência/animação são
rejeitadas; isto não faz remoção de fundo nem aplica uma cor de fundo implícita.
A saída contém somente o contêiner novo produzido pelo encoder.

A memória linear é fixa em 32 MiB e o teste exige que `memory.grow(1)` seja negado.
Isso não mede o RSS total do isolate, a velocidade de coleta do garbage collector,
o custo de vários adaptadores criados indevidamente ou CPU faturada na Cloudflare.
Apenas `wasi_snapshot_preview1.proc_exit` pode ser importado, e a ponte o transforma
em falha fechada. Imports inesperados ou versões diferentes são recusados.

Cancelamento é checado antes/depois dos estágios. Código WASM síncrono não é
interrompido por `AbortSignal` no meio da chamada; não afirmar timeout preemptivo.
A cópia temporária JS e os buffers de entrada/saída do bridge são limpos; a instância
não é reutilizada. Isso não promete limpeza forense de todo o heap interno da libwebp.

## Execução

O workflow `Student photo codec proof` faz checkouts fixados, compila o módulo,
empacota SOMENTE o worker em `tests/student-photos/codec-proof` por dry-run e
executa o teste no Miniflare/Workerd local da CI. Não há deploy, bindings produtivos
ou secrets no job. Os builds normais da aplicação não importam o módulo candidato.

Após instalar as dependências do repositório e preparar os dois checkouts fixados
nos caminhos indicados pelo workflow:

```sh
source node_modules/.cache/student-photo-codec-emsdk/emsdk_env.sh
bash scripts/student-photos/codec-v1/build.sh
npx wrangler deploy --dry-run --config tests/student-photos/codec-proof/wrangler.jsonc --outdir node_modules/.cache/student-photo-codec-proof
node tests/student-photos/codec-proof/verify.mjs
```

O artefato do run guarda `codec.wasm`, `provenance.json`, `proof.json` e avisos do
upstream. Nenhuma imagem é arquivada. O teste cria imagens sintéticas em memória;
Sharp é apenas gerador/decodificador independente de testes, nunca o codec do Worker.
Testa conversão efetiva, determinismo, qualidades explícitas, limites, cabeçalho
plausível sem pixels válidos, metadados, alpha/animação, excesso após reencodificação,
recuperação após rejeição e ausência de chamadas externas.

## Antes de compor com o gravador

1. Confirmar CI, fonte/licença/hash e revisão do head final, sem herdar checks de outro SHA.
2. Definir a entrega do módulo no build oficial e provar o mesmo artefato no bundle
   administrativo, sem compilação/download em requisição ou import no Portal de notas.
3. Propagar a escolha explícita de qualidade do operador até o codec e a prévia final.
   Uma segunda codificação com perdas pode modificar pixels; não afirmar identidade
   visual da prévia local. O protocolo atual da #1123 não recebe qualidade como campo
   próprio: esta prova não o amplia silenciosamente nem conecta um valor fixo oculto.
4. Compor autorização existente, Graph, recibos e cópia privada; validar recuperação,
   permissões efetivas, custo/memória concorrente e imagens autorizadas no fluxo real.

Até esses passos, escrita e exibição reais continuam fechadas. Esta prova não é
homologação de fotografias, teste autenticado com aluno ou autorização de imagem.
