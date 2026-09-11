import { useGradebookYear } from '../../../platform/gradebook-year-context';
import { useEffect, useState } from 'react';
import type {
  OperationalWorkspaceRequestV2,
  OperationalWorkspaceResponseV2,
  WorkspaceCenterV2,
  WorkspaceCountsV2,
  WorkspaceFailureStateV2,
  WorkspaceKindV2,
  WorkspaceLinkV2,
  WorkspaceOfferV2,
  WorkspaceSearchItemV2,
  WorkspaceYearV2,
} from '../../../../shared/gradebook-contracts/operational-workspace/operational-workspace-transport-v2';
import { compareSourceSubjectPresentationV1 } from '../../../../shared/gradebook-contracts/source/subject-abbreviations-v1';
import { requestOperationalWorkspaceV2 } from './operational-workspace-client-v2';
import { createOperationalWorkspaceRequestGate } from './operational-workspace-request-gate';

type Concern = 'context'|'search'|'detail';
const IDLE = {context:false,search:false,detail:false};
const PAGE_SIZE = 100;
function unique<T>(values: readonly T[], key: (value:T)=>string|number): T[] {
  const seen = new Set<string|number>();
  return values.filter((value) => {const id=key(value);if(seen.has(id)) return false;seen.add(id);return true;});
}
function orderOffers(left: WorkspaceOfferV2, right: WorkspaceOfferV2): number {
  return left.classGroup.label.localeCompare(right.classGroup.label, 'pt-BR') ||
    compareSourceSubjectPresentationV1(left.subject.label, right.subject.label) ||
    left.teacher.label.localeCompare(right.teacher.label, 'pt-BR') || left.id-right.id;
}
export function useRelationalWorkspaceV2() {
  const sharedYear = useGradebookYear();
  const year = sharedYear?.year ?? null;
  const clearSharedAuthorization = sharedYear?.clearAuthorization;
  const targetStudentId = sharedYear?.targetStudentId ?? null;
  const [gates] = useState(() => ({context:createOperationalWorkspaceRequestGate(),search:createOperationalWorkspaceRequestGate(),detail:createOperationalWorkspaceRequestGate()}));
  const [context,setContext] = useState<{year:WorkspaceYearV2;counts:WorkspaceCountsV2}|null>(null);
  const [kind,setKindValue] = useState<WorkspaceKindV2|'all'>('all');
  const [query,setQueryValue] = useState('');
  const [items,setItems] = useState<readonly WorkspaceSearchItemV2[]>([]);
  const [nextOffset,setNextOffset] = useState<number|null>(null);
  const [searched,setSearched] = useState(false);
  const [detail,setDetail] = useState<WorkspaceCenterV2|null>(null);
  const [busy,setBusy] = useState({...IDLE,context:true});
  const [failure,setFailure] = useState<WorkspaceFailureStateV2|null>(null);
  useEffect(() => () => {Object.values(gates).forEach((gate) => gate.invalidate());},[gates]);

  useEffect(() => {
    if (year === null) return;
    const request = {contractVersion:2,operation:'context',year} as const;
    const ticket = gates.context.begin(JSON.stringify(request));
    if (!ticket) return;
    void requestOperationalWorkspaceV2(request,ticket.signal).then((response) => {
      if (!ticket.isCurrent()) return;
      if (response.state === 'not-authorized') { clearSharedAuthorization?.(); setFailure('not-authorized'); }
      else if (response.state === 'ready' && response.operation === 'context') setContext({year:response.context,counts:response.counts});
      else if (response.state !== 'ready') setFailure(response.state);
    }).catch(() => {if(ticket.isCurrent()) setFailure('unavailable');}).finally(() => {
      if(ticket.isCurrent()) setBusy((current) => ({...current,context:false})); ticket.complete();
    });
    return () => gates.context.invalidate();
  }, [year,gates,clearSharedAuthorization]);
  useEffect(() => {
    if (year === null || targetStudentId === null || context?.year.year !== year) return;
    const request = {contractVersion:2,operation:'center',year,kind:'student',id:targetStudentId,offset:0,limit:PAGE_SIZE} as const;
    const ticket = gates.detail.begin(JSON.stringify(request));
    if (!ticket) return;
    void requestOperationalWorkspaceV2(request,ticket.signal).then((response) => {
      if(!ticket.isCurrent()) return;
      if(response.state === 'not-authorized') { clearSharedAuthorization?.(); setFailure('not-authorized'); }
      else if(response.state === 'ready' && response.operation === 'center') setDetail(response.center);
      else if(response.state !== 'ready') setFailure(response.state);
    }).catch(() => {if(ticket.isCurrent()) setFailure('unavailable');}).finally(() => ticket.complete());
    return () => gates.detail.invalidate();
  }, [year,targetStudentId,context,gates,clearSharedAuthorization]);

  function clearSearch() {
    gates.search.invalidate();gates.detail.invalidate();
    setItems([]);setNextOffset(null);setSearched(false);setDetail(null);
    setBusy((current) => ({...current,search:false,detail:false}));
  }
  function accessLost() {
    clearSharedAuthorization?.();
    Object.values(gates).forEach((gate) => gate.invalidate());
    setContext(null);setItems([]);
    setNextOffset(null);setDetail(null);setSearched(false);setBusy(IDLE);
    setFailure('not-authorized');
  }
  async function run(request: OperationalWorkspaceRequestV2, concern: Concern, apply: (response: Extract<OperationalWorkspaceResponseV2,{state:'ready'}>)=>void) {
    const ticket=gates[concern].begin(JSON.stringify(request));
    if (!ticket) return;
    setBusy((current) => ({...current,[concern]:true}));setFailure(null);
    try {
      const response=await requestOperationalWorkspaceV2(request,ticket.signal);
      if (!ticket.isCurrent()) return;
      if (response.state==='not-authorized') {accessLost();return;}
      if (response.state!=='ready') {setFailure(response.state);return;}
      apply(response);
    } catch {
      if (ticket.isCurrent()) setFailure('unavailable');
    } finally {
      if (ticket.isCurrent()) setBusy((current) => ({...current,[concern]:false}));
      ticket.complete();
    }
  }
  function setQuery(value:string) {clearSearch();setQueryValue(value);setFailure(null);}
  function setKind(value:WorkspaceKindV2|'all') {clearSearch();setKindValue(value);setFailure(null);}
  async function search(offset=0) {
    if(year === null || context?.year.year!==year) return;
    if(offset===0) {gates.detail.invalidate();setDetail(null);setItems([]);setNextOffset(null);setSearched(false);setBusy((current)=>({...current,detail:false}));}
    await run({contractVersion:2,operation:'search',year,kind,query,offset,limit:PAGE_SIZE},'search',(response) => {
      if(response.operation!=='search') return;
      setItems((current)=>offset===0?response.items:unique([...current,...response.items],(item)=>`${item.entity.kind}:${item.entity.id}`));
      setNextOffset(response.nextOffset);setSearched(true);
    });
  }
  async function open(entity:WorkspaceLinkV2, offset=0) {
    if(year === null || context?.year.year!==year) return;
    if(offset===0) setDetail(null);
    await run({contractVersion:2,operation:'center',year,kind:entity.kind,id:entity.id,offset,limit:PAGE_SIZE},'detail',(response) => {
      if(response.operation!=='center') return;
      setDetail((current)=>offset===0||current===null?response.center:{
        ...response.center,
        bindings:unique([...current.bindings,...response.center.bindings],(row)=>`${row.classGroup.id}:${row.number}`),
        offers:unique([...current.offers,...response.center.offers],(row)=>row.id).sort(orderOffers),
      });
    });
  }
  return {year,context,kind,query,items,nextOffset,searched,detail,busy,failure,setQuery,setKind,search,open};
}
