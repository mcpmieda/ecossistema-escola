# Auditoria visual — Centro de Administração v0.2

## Resultado

A candidata v0.2 atingiu os gates técnicos de aplicação e segurança, mas **não deve ser considerada visualmente aprovada**.

O primeiro teste autenticado do administrador encontrou dois achados materiais:

1. a interface não transmite o nível de acabamento moderno esperado a partir das referências adotadas pela App Factory;
2. o logout apagava a sessão no servidor, porém deixava o shell autenticado visível até uma recarga forçada do navegador.

O segundo ponto foi corrigido e validado externamente. O primeiro continua reabrindo o gate de UI e exige uma nova candidata visual antes de qualquer promoção oficial.

## O que a App Factory prescreve

A fonte normativa é `mcpmieda/app-factory/ui/PROFESSIONAL_UI_PROFILE.md`.

Para admin, dashboard, CRUD e ferramentas internas, a preferência da Factory é:

- `shadcn/ui` como base preferencial;
- `ReUI` como complemento seletivo para componentes administrativos avançados quando houver ganho real;
- `HeroUI` como alternativa principalmente para produtos cuja linguagem visual justifique essa escolha;
- `professional-default` como quality bar transversal, independentemente da biblioteca.

O perfil também exige, para UI material:

- hierarquia visual clara;
- spacing e tipografia coerentes;
- superfícies e densidade previsíveis;
- estados completos;
- desktop/mobile utilizáveis;
- foco, teclado e reduced-motion;
- browser QA real quando disponível;
- uso de componentes do design system antes de recriar equivalentes.

## O que realmente foi feito na v0.2

A arquitetura da candidata registrou:

- React + TypeScript + Vite existentes;
- `professional-default` como intenção;
- `comfortable + layered + balanced`;
- CSS/HTML nativos sobre a base existente;
- nenhuma biblioteca visual nova instalada.

O `package.json` confirma que a candidata não usa Tailwind, shadcn/ui, Radix ou ReUI.

A implementação recebeu:

- sidebar;
- page header;
- cards de métricas e módulos;
- tabela/listas;
- estados de loading/empty/error;
- responsividade;
- foco visível;
- reduced-motion;
- motion ambiente na entrada.

Isso melhorou organização e consistência, mas **não é equivalente a uma lapidação visual de referência**. Não houve uma etapa autenticada de comparação visual do produto final contra os padrões modernos esperados antes de declarar a candidata pronta para teste.

## Falha de processo identificada

O gate técnico foi corretamente separado da liberação oficial, mas a expressão “pronta para teste administrativo” acabou sendo interpretada como se o acabamento visual já tivesse sido suficientemente lapidado.

Isso não estava comprovado.

A própria `VERIFICATION.md` tratava a QA autenticada de desktop/mobile, logout e acabamento como etapa a ser realizada pelo administrador. Portanto, a UI não havia recebido aprovação humana final.

A avaliação atual corrige esse entendimento:

- arquitetura e segurança: aprovadas para continuar a validação;
- UI v0.2: **reprovada como candidata visual final**;
- logout v0.2: **corrigido, integrado e validado externamente**;
- release state: permanece `validation`.

## Evidência do fechamento do logout

O PR #8 alterou o contrato do logout de `204 No Content` para `303 See Other`, preservando a expiração do cookie e a validação de origem.

A execução de CI `32764734020` passou por format, lint, typecheck, testes, build, actionlint e zizmor.

Depois do deploy, um smoke externo descartável confirmou no domínio oficial:

- `POST /auth/logout` com `Origin` oficial retorna `303`;
- `Location` aponta para `https://admin.escolaieda.com`;
- o cookie `__Host-ecossistema_session` é expirado com `Max-Age=0`.

O PR temporário #9 foi fechado sem merge e seu branch foi resetado para a `main`.

## Direção obrigatória para a próxima candidata visual

A próxima iteração deve usar as referências da App Factory de forma explícita, não apenas nominal.

### Base visual

- usar shadcn como referência principal de linguagem administrativa: composição calma, superfícies neutras, bordas discretas, radius consistente, hierarquia tipográfica curta, controles compactos e estados de interação claros;
- usar ReUI seletivamente somente onde houver componente administrativo avançado real; não adicionar ReUI apenas para “parecer moderno”;
- usar HeroUI apenas como referência de composição/motion quando trouxer ganho concreto, sem misturar design systems indiscriminadamente.

### Processo de aprovação

Antes de chamar a nova candidata de visualmente lapidada:

1. registrar inventário real de componentes;
2. definir shell, sidebar/topbar, page headers, cards, tabelas/listas, estados, menus e conta;
3. comparar a composição contra os arquétipos da App Factory;
4. validar desktop e mobile em navegador real;
5. testar navegação, foco, hover/active, loading, empty, error e logout;
6. verificar que a interface não caiu nos anti-padrões de “UI gerada por IA”;
7. colher validação humana do administrador sobre aparência e usabilidade.

## Regra de release

Nenhuma correção desta auditoria altera o protocolo vigente: `APROVADO PARA PRODUÇÃO` continua sendo o único comando que pode autorizar a futura liberação oficial.
