import { useGradebookYear } from '../../../platform/gradebook-year-context';
import { useEffect, useRef } from 'react';
import { Alert, Button, Card, Chip, SearchField, Spinner } from '@heroui/react';
import type { WorkspaceBindingV2, WorkspaceCenterV2, WorkspaceKindV2, WorkspaceLinkV2, WorkspaceStatusV2 } from '../../../../shared/gradebook-contracts/operational-workspace/operational-workspace-transport-v2';
import { WORKSPACE_KINDS_V2 } from '../../../../shared/gradebook-contracts/operational-workspace/operational-workspace-transport-v2';
import { useRelationalWorkspaceV2 } from './use-relational-workspace-v2';

const LABELS: Record<WorkspaceKindV2,string> = {student:'Aluno','class-group':'Turma',teacher:'Professor',subject:'Componente'};
const STATUSES: Record<Exclude<WorkspaceStatusV2,null>,string> = {1:'Especial',2:'Assistido',3:'Desistente',4:'Transferido',5:'Falecido',6:'Foi para',7:'Estava no'};
function Link({value,onOpen}:{value:WorkspaceLinkV2;onOpen:(value:WorkspaceLinkV2)=>void}) {
  return <Button size="sm" variant="ghost" className="h-auto max-w-full whitespace-normal break-words text-left" onPress={()=>onOpen(value)}>{value.label}</Button>;
}
function BindingTable({values,onOpen}:{values:readonly WorkspaceBindingV2[];onOpen:(value:WorkspaceLinkV2)=>void}) {
  return <div className="overflow-x-auto"><table className="w-full text-left text-sm">
    <caption className="sr-only">Vínculos cadastrados no ano selecionado</caption>
    <thead><tr><th className="p-2">Nº</th><th className="p-2">Aluno</th><th className="p-2">Turma</th><th className="p-2">Situação</th><th className="p-2">Posição</th></tr></thead>
    <tbody>{values.map((row)=><tr key={`${row.classGroup.id}:${row.number}`} className="border-t border-separator">
      <td className="p-2">{row.number}</td><td className="p-2"><Link value={row.student} onOpen={onOpen}/></td><td className="p-2"><Link value={row.classGroup} onOpen={onOpen}/></td>
      <td className="p-2">{row.status===null?'Sem situação especial':STATUSES[row.status]}{row.relatedClass?<Link value={row.relatedClass} onOpen={onOpen}/>:null}</td>
      <td className="p-2"><Chip size="sm" variant="soft">{row.position==='current'?'Atual':'Histórica'}</Chip></td>
    </tr>)}</tbody></table></div>;
}
function Center({value,onOpen,busy,onMore}:{value:WorkspaceCenterV2;onOpen:(value:WorkspaceLinkV2)=>void;busy:boolean;onMore:()=>void}) {
  const heading=useRef<HTMLHeadingElement>(null);
  const key=`${value.entity.kind}:${value.entity.id}`;
  useEffect(()=>{heading.current?.focus();},[key]);
  return <Card><Card.Header>
    <Card.Description>Central: {LABELS[value.entity.kind]}</Card.Description>
    <Card.Title ref={heading} tabIndex={-1} className="break-words outline-none focus-visible:ring-2 focus-visible:ring-focus">{value.entity.label}</Card.Title>
  </Card.Header><Card.Content className="grid min-w-0 gap-5">
    {value.classInfo?<p className="text-sm text-muted">Etapa {value.classInfo.stage} · Turno {value.classInfo.shift}</p>:null}
    {value.studentInfo?<p className="text-sm">Aprovação pelo Conselho no ano anterior: <strong>{value.studentInfo.councilPrevious===null?'Não informado':value.studentInfo.councilPrevious?'Sim':'Não'}</strong></p>:null}
    {value.entity.kind==='student'||value.entity.kind==='class-group'?<section>
      <h3 className="mb-2 font-semibold">Vínculos do ano</h3>
      {value.bindings.length?<BindingTable values={value.bindings} onOpen={onOpen}/>:<p className="text-sm text-muted">Nenhum vínculo encontrado nesta consulta.</p>}
      <p className="mt-2 text-xs text-muted">A posição atual identifica a turma do cadastro. Não indica, por si só, elegibilidade para indicadores ou resultados.</p>
    </section>:null}
    <section><h3 className="mb-2 font-semibold">{value.entity.kind==='student'?'Ofertas da turma atual':'Ofertas do ano'}</h3>
      {value.offers.length?<div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Turma</th><th className="p-2">Professor</th><th className="p-2">Componente</th></tr></thead>
        <tbody>{value.offers.map((offer)=><tr key={offer.id} className="border-t border-separator"><td className="p-2"><Link value={offer.classGroup} onOpen={onOpen}/></td><td className="p-2"><Link value={offer.teacher} onOpen={onOpen}/></td><td className="p-2"><Link value={offer.subject} onOpen={onOpen}/></td></tr>)}</tbody></table></div>:<p className="text-sm text-muted">Nenhuma oferta encontrada nesta consulta.</p>}
    </section>
    {value.nextOffset!==null?<Button variant="secondary" isDisabled={busy} onPress={onMore}>Carregar mais vínculos e ofertas</Button>:null}
  </Card.Content></Card>;
}
export function RelationalWorkspacePageV2() {
  const sharedYear=useGradebookYear();
  const workspace=useRelationalWorkspaceV2();
  const searchInput=useRef<HTMLInputElement>(null);
  const year=workspace.year;
  useEffect(()=>{if(workspace.context) searchInput.current?.focus();},[workspace.context]);
  const failures={
    'not-authorized':'Sua sessão não possui autorização para consultar estas informações. Entre novamente com uma conta autorizada.',
    'not-found':'O ano ou o cadastro solicitado não foi encontrado. Atualize o catálogo e selecione novamente.',
    'invalid-request':'Não foi possível interpretar esta consulta. Confira os filtros e tente novamente.',
    unavailable:'Não foi possível concluir a consulta. Tente novamente; nenhuma informação foi alterada.',
  } as const;
  return <section aria-label="Centrais acadêmicas" className="grid min-w-0 gap-5">
    <Card><Card.Header><Card.Title>Centrais acadêmicas</Card.Title><Card.Description>Consulte alunos, turmas, professores e componentes do cadastro anual.</Card.Description></Card.Header>
      <Card.Content className="grid gap-4">
        {!sharedYear ? <div className="flex flex-wrap items-end gap-3">
          <Button variant="secondary" isDisabled={workspace.busy.bootstrap} onPress={()=>void workspace.bootstrap()}>{workspace.bootstrapped?'Atualizar catálogo':'Carregar Centrais'}</Button>
          <label className="grid gap-1 text-sm">Ano letivo
            <select aria-label="Ano letivo" className="rounded-xl border border-separator bg-surface px-3 py-2 focus-visible:ring-2 focus-visible:ring-focus" value={year??''} disabled={workspace.busy.bootstrap||!workspace.years.length} onChange={(event)=>void workspace.selectYear(event.target.value?Number(event.target.value):null)}>
              <option value="">Selecione o ano</option>{workspace.years.map((value)=><option key={value.year} value={value.year}>{value.year}</option>)}
            </select>
          </label>
        </div> : null}
        {!sharedYear&&workspace.bootstrapped&&!workspace.years.length&&!workspace.failure?<p className="text-sm text-muted">Nenhum ano cadastrado foi encontrado.</p>:null}
        {sharedYear && year === null ? <p>Selecione o ano letivo no topo do Banco.</p> : null}
        {workspace.context?<div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4" aria-label="Resumo cadastral">
          <span><strong>{workspace.context.counts.students}</strong> alunos</span><span><strong>{workspace.context.counts.classes}</strong> turmas</span>
          <span><strong>{workspace.context.counts.teachers}</strong> professores</span><span><strong>{workspace.context.counts.subjects}</strong> componentes</span>
          <span><strong>{workspace.context.counts.offers}</strong> ofertas</span><span><strong>{workspace.context.counts.currentBindings}</strong> vínculos atuais</span><span><strong>{workspace.context.counts.historicalBindings}</strong> vínculos históricos</span>
        </div>:null}
        <p className="text-xs text-muted">Consulta somente leitura. Alterações de professores e atribuições serão habilitadas após a adaptação da manutenção cadastral.</p>
      </Card.Content>
    </Card>
    {workspace.failure?<Alert status={workspace.failure==='not-authorized'?'warning':'danger'}><Alert.Indicator/><Alert.Content><Alert.Title>Consulta não concluída</Alert.Title><Alert.Description>{failures[workspace.failure]}</Alert.Description></Alert.Content></Alert>:null}
    {workspace.context?<Card><Card.Header><Card.Title>Pesquisar no ano {year}</Card.Title></Card.Header><Card.Content className="grid gap-4">
      <form className="flex flex-wrap items-end gap-3" onSubmit={(event)=>{event.preventDefault();void workspace.search();}}>
        <label className="grid gap-1 text-sm">Pesquisar por
          <select aria-label="Pesquisar por" className="rounded-xl border border-separator bg-surface px-3 py-2" value={workspace.kind} onChange={(event)=>workspace.setKind(event.target.value as WorkspaceKindV2|'all')}>
            <option value="all">Todos</option>{WORKSPACE_KINDS_V2.map((kind)=><option key={kind} value={kind}>{LABELS[kind]}</option>)}
          </select>
        </label>
        <SearchField aria-label="Nome ou código" value={workspace.query} onChange={workspace.setQuery} className="min-w-0 flex-1"><SearchField.Group><SearchField.Input ref={searchInput} maxLength={80} placeholder="Nome ou código; vazio lista os cadastros"/><SearchField.ClearButton/></SearchField.Group></SearchField>
        <Button type="submit" isDisabled={workspace.busy.search}>Pesquisar</Button>
      </form>
      <p className="text-xs text-muted">Busca literal por nome ou código. Não compara desempenho nem reúne pessoas com o mesmo nome.</p>
      <div aria-live="polite" role="status">{workspace.searched?`${workspace.items.length} resultado(s) carregado(s).`:''}</div>
      {workspace.items.length?<ul className="grid gap-2 md:grid-cols-2">{workspace.items.map((item)=><li key={`${item.entity.kind}:${item.entity.id}`} className="min-w-0 rounded-xl border border-separator p-3">
        <p className="text-xs text-muted">{LABELS[item.entity.kind]}{item.description?` · ${item.description}`:''}</p><Link value={item.entity} onOpen={(value)=>void workspace.open(value)}/>
      </li>)}</ul>:workspace.searched?<p className="text-sm text-muted">Nenhum cadastro encontrado para esta consulta.</p>:null}
      {workspace.nextOffset!==null?<Button variant="secondary" isDisabled={workspace.busy.search} onPress={()=>void workspace.search(workspace.nextOffset!)}>Carregar mais resultados</Button>:null}
    </Card.Content></Card>:null}
    {Object.values(workspace.busy).some(Boolean)?<div role="status" className="flex items-center gap-2 text-sm"><Spinner size="sm"/>Carregando consulta…</div>:null}
    {workspace.detail?<Center value={workspace.detail} onOpen={(value)=>void workspace.open(value)} busy={workspace.busy.detail} onMore={()=>void workspace.open(workspace.detail!.entity,workspace.detail!.nextOffset!)}/>:null}
  </section>;
}
