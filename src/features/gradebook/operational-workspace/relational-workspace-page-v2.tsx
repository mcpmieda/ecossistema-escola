import { useEffect, useRef, type ReactNode } from 'react';
import { Alert, Button, Card, Chip, Label, ListBox, SearchField, Select, Spinner, Surface } from '@heroui/react';
import { BookOpenCheck, GraduationCap, Library, Link2, Search, School, UsersRound } from 'lucide-react';
import type { WorkspaceBindingV2, WorkspaceCenterV2, WorkspaceKindV2, WorkspaceLinkV2, WorkspaceStatusV2 } from '../../../../shared/gradebook-contracts/operational-workspace/operational-workspace-transport-v2';
import { WORKSPACE_KINDS_V2 } from '../../../../shared/gradebook-contracts/operational-workspace/operational-workspace-transport-v2';
import { sourceSubjectAbbreviationV1 } from '../../../../shared/gradebook-contracts/source/subject-abbreviations-v1';
import { useRelationalWorkspaceV2 } from './use-relational-workspace-v2';

const LABELS: Record<WorkspaceKindV2,string> = {student:'Aluno','class-group':'Turma',teacher:'Professor',subject:'Componente'};
const PLURAL_LABELS: Record<WorkspaceKindV2,string> = {student:'Alunos','class-group':'Turmas',teacher:'Professores',subject:'Componentes'};
const STATUSES: Record<Exclude<WorkspaceStatusV2,null>,string> = {1:'Especial',2:'Assistido',3:'Desistente',4:'Transferido',5:'Falecido',6:'Foi para',7:'Estava no'};
const FILTERS = [{id:'all',label:'Todos os cadastros'},...WORKSPACE_KINDS_V2.map((kind)=>({id:kind,label:PLURAL_LABELS[kind]}))];

function Link({value,onOpen}:{value:WorkspaceLinkV2;onOpen:(value:WorkspaceLinkV2)=>void}) {
  return <Button size="sm" variant="ghost" className="h-auto max-w-full justify-start whitespace-normal break-words px-2 text-left" onPress={()=>onOpen(value)}>{value.label}</Button>;
}

function Metric({label,value,icon,tone}:{label:string;value:number;icon:ReactNode;tone:string}) {
  return <Surface variant="default" className="min-w-0 rounded-2xl border border-border/70 p-4 shadow-sm">
    <div className="flex items-start justify-between gap-3">
      <div><p className="text-xs font-medium text-muted">{label}</p><p className="mt-1 text-2xl font-semibold tracking-[-0.04em]">{value.toLocaleString('pt-BR')}</p></div>
      <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${tone}`} aria-hidden="true">{icon}</span>
    </div>
  </Surface>;
}

function EntityIcon({kind}:{kind:WorkspaceKindV2}) {
  const icon = kind==='student'?<GraduationCap/>:kind==='class-group'?<School/>:kind==='teacher'?<UsersRound/>:<Library/>;
  return <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent [&>svg]:size-5" aria-hidden="true">{icon}</span>;
}

function BindingTable({values,onOpen}:{values:readonly WorkspaceBindingV2[];onOpen:(value:WorkspaceLinkV2)=>void}) {
  return <div className="overflow-x-auto rounded-2xl border border-border/70"><table className="w-full text-left text-sm">
    <caption className="sr-only">Vínculos cadastrados em 2026</caption>
    <thead className="bg-surface-secondary/70 text-xs text-muted"><tr><th className="p-3">Nº</th><th className="p-3">Aluno</th><th className="p-3">Turma</th><th className="p-3">Situação</th><th className="p-3">Posição</th></tr></thead>
    <tbody>{values.map((row)=><tr key={`${row.classGroup.id}:${row.number}`} className="border-t border-separator transition-colors hover:bg-surface-secondary/40">
      <td className="p-3 font-medium">{row.number}</td><td className="p-1"><Link value={row.student} onOpen={onOpen}/></td><td className="p-1"><Link value={row.classGroup} onOpen={onOpen}/></td>
      <td className="p-3">{row.status===null?'Sem situação especial':STATUSES[row.status]}{row.relatedClass?<span className="ml-1"><Link value={row.relatedClass} onOpen={onOpen}/></span>:null}</td>
      <td className="p-3"><Chip size="sm" variant="soft" color={row.position==='current'?'success':'default'}>{row.position==='current'?'Atual':'Histórica'}</Chip></td>
    </tr>)}</tbody></table></div>;
}

function OfferCards({value,onOpen}:{value:WorkspaceCenterV2;onOpen:(value:WorkspaceLinkV2)=>void}) {
  if (!value.offers.length) return <p className="text-sm text-muted">Nenhuma oferta encontrada nesta consulta.</p>;
  return <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{value.offers.map((offer)=>{
    const abbreviation=sourceSubjectAbbreviationV1(offer.subject.label);
    return <Surface key={offer.id} variant="secondary" className="rounded-2xl border border-border/60 p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 font-semibold text-primary" aria-hidden="true">{abbreviation??<BookOpenCheck className="size-5"/>}</span>
        <div className="min-w-0 flex-1"><p className="text-xs font-medium text-muted">Componente</p><Link value={offer.subject} onOpen={onOpen}/></div>
      </div>
      <div className="mt-3 grid gap-1 border-t border-border/60 pt-3 text-xs text-muted">
        <span className="flex items-center gap-2"><School className="size-3.5" aria-hidden="true"/><Link value={offer.classGroup} onOpen={onOpen}/></span>
        <span className="flex items-center gap-2"><UsersRound className="size-3.5" aria-hidden="true"/><Link value={offer.teacher} onOpen={onOpen}/></span>
      </div>
    </Surface>;
  })}</div>;
}

function Center({value,onOpen,busy,onMore}:{value:WorkspaceCenterV2;onOpen:(value:WorkspaceLinkV2)=>void;busy:boolean;onMore:()=>void}) {
  const heading=useRef<HTMLHeadingElement>(null);
  const key=`${value.entity.kind}:${value.entity.id}`;
  useEffect(()=>{heading.current?.focus();},[key]);
  const teacherConfiguration=value.entity.kind==='teacher';
  return <Card className="overflow-hidden"><Card.Header className="border-b border-separator bg-surface-secondary/35">
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><EntityIcon kind={value.entity.kind}/><div className="min-w-0">
      <Card.Description>{teacherConfiguration?'Configuração docente importada':`Central de ${LABELS[value.entity.kind].toLowerCase()}`}</Card.Description>
      <Card.Title ref={heading} tabIndex={-1} className="break-words outline-none focus-visible:ring-2 focus-visible:ring-focus">{value.entity.label}</Card.Title>
    </div></div><Chip size="sm" color="accent" variant="soft">2026</Chip></div>
  </Card.Header><Card.Content className="grid min-w-0 gap-6 pt-5">
    {value.classInfo?<div className="flex flex-wrap gap-2"><Chip size="sm" variant="soft">Etapa {value.classInfo.stage}</Chip><Chip size="sm" variant="soft">Turno {value.classInfo.shift}</Chip></div>:null}
    {teacherConfiguration?<Alert status="default"><Alert.Indicator/><Alert.Content><Alert.Title>Cadastro reconhecido na fonte</Alert.Title><Alert.Description>As ofertas abaixo refletem as planilhas importadas. Ajustes de professor, turma ou componente são feitos na fonte e reaplicados pela Importação, preservando uma única autoridade cadastral.</Alert.Description></Alert.Content></Alert>:null}
    {value.entity.kind==='student'||value.entity.kind==='class-group'?<section>
      <h3 className="mb-3 font-semibold">Vínculos do ano</h3>
      {value.bindings.length?<BindingTable values={value.bindings} onOpen={onOpen}/>:<p className="text-sm text-muted">Nenhum vínculo encontrado nesta consulta.</p>}
      <p className="mt-2 text-xs text-muted">A posição atual identifica a turma do cadastro. Não indica, por si só, elegibilidade para indicadores ou resultados.</p>
    </section>:null}
    <section><div className="mb-3 flex flex-wrap items-end justify-between gap-2"><div><h3 className="font-semibold">{value.entity.kind==='student'?'Ofertas da turma atual':'Ofertas de 2026'}</h3><p className="mt-1 text-xs text-muted">Ordem da configuração docente: P, M, H, G, C e demais componentes observados.</p></div><Chip size="sm" variant="soft"><Link2 className="mr-1 size-3.5" aria-hidden="true"/>{value.offers.length} carregada(s)</Chip></div>
      <OfferCards value={value} onOpen={onOpen}/>
    </section>
    {value.nextOffset!==null?<Button variant="secondary" isDisabled={busy} onPress={onMore}>Carregar mais vínculos e ofertas</Button>:null}
  </Card.Content></Card>;
}

export function RelationalWorkspacePageV2() {
  const workspace=useRelationalWorkspaceV2();
  const searchInput=useRef<HTMLInputElement>(null);
  useEffect(()=>{if(workspace.context) searchInput.current?.focus();},[workspace.context]);
  const failures={
    'not-authorized':'Sua sessão não possui autorização para consultar estas informações. Entre novamente com uma conta autorizada.',
    'not-found':'O cadastro solicitado não foi encontrado no ano letivo 2026. Atualize a consulta.',
    'invalid-request':'Não foi possível interpretar esta consulta. Confira os filtros e tente novamente.',
    unavailable:'Não foi possível concluir a consulta. Tente novamente; nenhuma informação foi alterada.',
  } as const;
  const counts=workspace.context?.counts;
  return <section aria-label="Centrais acadêmicas" className="grid min-w-0 gap-5">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-accent"><BookOpenCheck className="size-4" aria-hidden="true"/>Cadastro anual</div><h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">Cadastros e configuração docente</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-muted">Consulte alunos, turmas, professores, componentes e as ofertas reconhecidas nas planilhas de 2026.</p></div><Chip color="success" variant="soft">Fonte importada · 2026</Chip></header>
    {counts?<div className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="Resumo cadastral">
      <Metric label="Alunos" value={counts.students} icon={<GraduationCap className="size-5"/>} tone="bg-accent/10 text-accent"/>
      <Metric label="Turmas" value={counts.classes} icon={<School className="size-5"/>} tone="bg-success/10 text-success"/>
      <Metric label="Professores" value={counts.teachers} icon={<UsersRound className="size-5"/>} tone="bg-warning/10 text-warning"/>
      <Metric label="Componentes" value={counts.subjects} icon={<Library className="size-5"/>} tone="bg-primary/10 text-primary"/>
      <Metric label="Ofertas" value={counts.offers} icon={<Link2 className="size-5"/>} tone="bg-danger/10 text-danger"/>
    </div>:null}
    {workspace.failure?<Alert status={workspace.failure==='not-authorized'?'warning':'danger'}><Alert.Indicator/><Alert.Content><Alert.Title>Consulta não concluída</Alert.Title><Alert.Description>{failures[workspace.failure]}</Alert.Description></Alert.Content></Alert>:null}
    {workspace.context?<Card className="overflow-visible"><Card.Content className="grid gap-4 p-4 sm:p-5">
      <form className="grid gap-3 lg:grid-cols-[minmax(220px,0.34fr)_minmax(300px,1fr)_auto] lg:items-end" onSubmit={(event)=>{event.preventDefault();void workspace.search();}}>
        <Select selectedKey={workspace.kind} onSelectionChange={(key)=>{if(key!==null) workspace.setKind(String(key) as WorkspaceKindV2|'all');}}>
          <Label className="text-sm font-medium">Pesquisar por</Label><Select.Trigger className="min-h-11 w-full"><Select.Value/><Select.Indicator/></Select.Trigger>
          <Select.Popover><ListBox>{FILTERS.map((item)=><ListBox.Item key={item.id} id={item.id} textValue={item.label}>{item.label}<ListBox.ItemIndicator/></ListBox.Item>)}</ListBox></Select.Popover>
        </Select>
        <SearchField aria-label="Nome ou código" value={workspace.query} onChange={workspace.setQuery} className="min-w-0"><Label className="text-sm font-medium">Nome ou código</Label><SearchField.Group><Search className="ml-3 size-4 text-muted" aria-hidden="true"/><SearchField.Input ref={searchInput} maxLength={80} placeholder="Digite para filtrar; vazio lista tudo"/><SearchField.ClearButton/></SearchField.Group></SearchField>
        <Button type="submit" className="min-h-11" isDisabled={workspace.busy.search}>{workspace.busy.search?<Spinner size="sm"/>:<Search className="size-4" aria-hidden="true"/>}Pesquisar</Button>
      </form>
      <p className="text-xs text-muted">Busca literal, sem unir homônimos. Esta área é somente leitura; alterações cadastrais entram pela Importação.</p>
      <div aria-live="polite" role="status" className="text-sm text-muted">{workspace.searched?`${workspace.items.length} resultado(s) carregado(s).`:''}</div>
      {workspace.items.length?<ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{workspace.items.map((item)=><li key={`${item.entity.kind}:${item.entity.id}`}><Surface variant="secondary" className="h-full rounded-2xl border border-border/60 p-3"><div className="flex items-center gap-3"><EntityIcon kind={item.entity.kind}/><div className="min-w-0 flex-1"><p className="text-xs font-medium text-muted">{LABELS[item.entity.kind]}{item.description?` · ${item.description}`:''}</p><Link value={item.entity} onOpen={(value)=>void workspace.open(value)}/></div></div></Surface></li>)}</ul>:workspace.searched?<div className="rounded-2xl border border-dashed border-border p-8 text-center"><p className="font-medium">Nenhum cadastro encontrado</p><p className="mt-1 text-sm text-muted">Tente outro nome, código ou tipo de cadastro.</p></div>:null}
      {workspace.nextOffset!==null?<Button variant="secondary" isDisabled={workspace.busy.search} onPress={()=>void workspace.search(workspace.nextOffset!)}>Carregar mais resultados</Button>:null}
    </Card.Content></Card>:null}
    {workspace.busy.context?<div role="status" className="flex items-center gap-2 text-sm text-muted"><Spinner size="sm"/>Carregando cadastro de 2026…</div>:null}
    {workspace.detail?<Center value={workspace.detail} onOpen={(value)=>void workspace.open(value)} busy={workspace.busy.detail} onMore={()=>void workspace.open(workspace.detail!.entity,workspace.detail!.nextOffset!)}/>:null}
  </section>;
}
