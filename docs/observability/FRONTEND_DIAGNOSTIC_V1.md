# Frontend Diagnostic V1 — contrato sanitizado

Estado: **contrato apenas**. Nenhum receiver, persistência, destino externo ou alerta é criado por este documento.

## Um contrato para Banco, Portal e Plataforma

Todas as superfícies usam o mesmo DTO e a mesma rota relativa:

- `POST /api/observability/frontend-diagnostic`;
- versão `1`;
- área: `gradebook | student-portal | platform`;
- categoria: `module-load | render | read`;
- `release`: versão/SHA publicada, limitada a identificador simples;
- `correlationId`: UUID opaco.

O cliente **não envia horário**. `recordedAt` pertence somente ao futuro registro criado pelo servidor.

## Dados proibidos

O contrato é fechado: qualquer campo extra invalida o payload. Portanto não há espaço para:
- aluno/ID/turma/nota/nascimento;
- senha, token ou credencial;
- URL/rota completa;
- stack;
- mensagem de erro bruta;
- SQL, parâmetros ou corpo de request;
- conteúdo de formulário ou rascunho.

O corpo bruto é limitado a 1.024 bytes. JSON inválido, campos extras, enums desconhecidos, release arbitrária e correlação não UUID falham fechado sem eco do conteúdo.

## Autorização e origem do futuro receiver

V1 não admite envio anônimo.

- superfície administrativa: sessão administrativa válida + `platform.snapshot.read`;
- Portal do Aluno: sessão self válida;
- always same-origin; body nunca concede identidade, capability ou escopo;
- respostas devem usar `no-store`.

Essas regras são requisitos de implementação futura; este contrato não monta handler.

## Frequência e deduplicação

Política V1 reservada para o receiver:
- máximo 6 relatórios por sujeito autenticado por 60 segundos;
- deduplicar por `area + category + release + correlationId` por 5 minutos;
- cliente envia no máximo uma tentativa; não cria retry automático;
- falha, rate-limit ou indisponibilidade da telemetria nunca recarrega a página nem altera o outcome acadêmico/operacional principal.

Qualquer mudança desses limites exige versão/decisão explícita, não relaxamento silencioso.

## O que já existe e o que não deve ser reutilizado como receiver

- `server/student-portal/observability/metrics-v1.ts`: métricas numéricas/log-only e fail-open; serve como princípio de minimização, não como armazenamento de falha frontend.
- `shared/gradebook-import-diagnostics-v1.ts`: diagnóstico enumerado de importação em header; é domínio específico e não recebe eventos genéricos.
- logs estruturados com `correlationId`: ajudam rastreabilidade, mas não constituem receiver persistente.

## Hard stop externo

Não implementar persistência até estarem definidos e aprovados:
1. destino operacional;
2. retenção;
3. responsáveis e acesso;
4. política de consulta/alerta.

Sem esses itens, o máximo que pode ser declarado é **contrato e sanitização prontos**. Não declarar observabilidade operacional completa.
