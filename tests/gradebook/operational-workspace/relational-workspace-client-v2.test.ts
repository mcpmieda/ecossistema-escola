// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requestOperationalWorkspaceV2 } from '../../../src/features/gradebook/operational-workspace/operational-workspace-client-v2';
import { useRelationalWorkspaceV2 } from '../../../src/features/gradebook/operational-workspace/use-relational-workspace-v2';
import { RelationalWorkspacePageV2 } from '../../../src/features/gradebook/operational-workspace/relational-workspace-page-v2';
import type { OperationalWorkspaceRequestV2, WorkspaceLinkV2 } from '../../../shared/gradebook-contracts/operational-workspace/operational-workspace-transport-v2';

// This suite uses createElement, not JSX; .test.ts is the existing runner's discovery pattern.
const year = {year:2090,minimumApprovalMilli:60000,maxCouncilComponents:2};
const entity:WorkspaceLinkV2={kind:'student',id:1,label:'ALUNO SINTETICO'};
const bootstrap={contractVersion:2,state:'ready',operation:'bootstrap',years:[year,{...year,year:2091}]};
const context=(value=2090)=>({contractVersion:2,state:'ready',operation:'context',context:{...year,year:value},counts:{students:1,classes:1,teachers:1,subjects:1,offers:1,currentBindings:1,historicalBindings:0}});
const search=(label='ALUNO SINTETICO',value=2090,nextOffset:number|null=null)=>({contractVersion:2,state:'ready',operation:'search',context:{...year,year:value},items:[{entity:{...entity,label},description:'A1 · Nº 1'}],nextOffset});
const detail={contractVersion:2,state:'ready',operation:'center',context:year,center:{entity,classInfo:null,studentInfo:{councilPrevious:null},bindings:[],offers:[],nextOffset:null}};
const searchRequest:Extract<OperationalWorkspaceRequestV2,{operation:'search'}>={contractVersion:2,operation:'search',year:2090,kind:'student',query:'',offset:0,limit:100};
let fetchMock:ReturnType<typeof vi.fn<typeof fetch>>;
let root:Root|null=null;
let host:HTMLDivElement;
let current:ReturnType<typeof useRelationalWorkspaceV2>;
function Harness() {current=useRelationalWorkspaceV2();return createElement('output',null,JSON.stringify({year:current.year,items:current.items,detail:current.detail,failure:current.failure}));}
function reply(value:unknown,status=200) {return Response.json(value,{status});}
function deferred() {
  let resolve!:(value:Response)=>void;
  const promise=new Promise<Response>((accept)=>{resolve=accept;});
  return {promise,resolve};
}
beforeEach(()=>{
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  // jsdom has no layout/media engine. These adapters do not claim visual validation.
  vi.stubGlobal('matchMedia',(media:string)=>({media,matches:false,onchange:null,addListener:vi.fn(),removeListener:vi.fn(),addEventListener:vi.fn(),removeEventListener:vi.fn(),dispatchEvent:()=>true}));
  vi.stubGlobal('ResizeObserver',class {observe=vi.fn();unobserve=vi.fn();disconnect=vi.fn();});
  fetchMock=vi.fn<typeof fetch>();vi.stubGlobal('fetch',fetchMock);
  host=document.createElement('div');document.body.appendChild(host);
});
afterEach(async()=>{if(root) {await act(async()=>{root!.unmount();});root=null;}host.remove();vi.unstubAllGlobals();});
async function mount() {root=createRoot(host);await act(async()=>{root!.render(createElement(Harness));});}
async function load() {
  fetchMock.mockResolvedValueOnce(reply(bootstrap));await act(async()=>{await current.bootstrap();});
  fetchMock.mockResolvedValueOnce(reply(context()));await act(async()=>{await current.selectYear(2090);});
}

describe('V2 transport rejects invalid, stale-context and false-success responses',()=>{
  it('posts to the existing endpoint with same-origin credentials, no-store and cancellation',async()=>{
    fetchMock.mockResolvedValueOnce(reply(search()));const controller=new AbortController();
    expect(await requestOperationalWorkspaceV2(searchRequest,controller.signal)).toMatchObject({state:'ready'});
    expect(fetchMock).toHaveBeenCalledWith('/api/gradebook/operational-workspace',expect.objectContaining({method:'POST',credentials:'same-origin',cache:'no-store',signal:controller.signal,body:JSON.stringify(searchRequest)}));
  });
  it.each([401,403])('handles opaque authentication responses with status %i',async(status)=>{
    fetchMock.mockResolvedValueOnce(reply({contractVersion:1,state:'not-authorized'},status));
    expect(await requestOperationalWorkspaceV2(searchRequest)).toEqual({contractVersion:2,state:'not-authorized'});
  });
  it.each([search('SYNTHETIC',2091),{...search(),contractVersion:1},{...search(),nextOffset:1},{...search(),items:[{entity:{...entity,id:'student:1'},description:null}]},{...search(),operation:'context'}])('rejects invalid or mismatched payloads',async(value)=>{
    fetchMock.mockResolvedValueOnce(reply(value));
    expect(await requestOperationalWorkspaceV2(searchRequest)).toEqual({contractVersion:2,state:'unavailable'});
  });
  it('does not accept a success body on a failing HTTP status',async()=>{
    fetchMock.mockResolvedValueOnce(reply(search(),500));
    expect(await requestOperationalWorkspaceV2(searchRequest)).toEqual({contractVersion:2,state:'unavailable'});
  });
  it('rejects invalid inputs without any network operation',async()=>{
    expect(await requestOperationalWorkspaceV2({...searchRequest,limit:201})).toEqual({contractVersion:2,state:'invalid-request'});
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('react workspace request lifecycle with synthetic HTTP responses',()=>{
  it('is lazy and does not select a year based on clock or catalogue order',async()=>{
    await mount();expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(reply(bootstrap));await act(async()=>{await current.bootstrap();});
    expect(current.years).toHaveLength(2);expect(current.year).toBeNull();expect(current.context).toBeNull();
  });
  it('loads year, search and center without invoking the V1 transport',async()=>{
    await mount();await load();
    fetchMock.mockResolvedValueOnce(reply(search()));await act(async()=>{await current.search();});
    fetchMock.mockResolvedValueOnce(reply(detail));await act(async()=>{await current.open(entity);});
    expect(current.items).toHaveLength(1);expect(current.detail?.studentInfo?.councilPrevious).toBeNull();
    expect(fetchMock.mock.calls.every(([,options])=>JSON.parse(String(options?.body)).contractVersion===2)).toBe(true);
  });
  it('aborts and ignores a delayed search after the query changes',async()=>{
    await mount();await load();const old=deferred();fetchMock.mockReturnValueOnce(old.promise);
    let pending!:Promise<void>;await act(async()=>{pending=current.search();});
    const signal=fetchMock.mock.calls.at(-1)![1]!.signal!;
    await act(async()=>{current.setQuery('new');});expect(signal.aborted).toBe(true);
    fetchMock.mockResolvedValueOnce(reply(search('NEW SYNTHETIC')));await act(async()=>{await current.search();});
    await act(async()=>{old.resolve(reply(search('OLD SYNTHETIC')));await pending;});
    expect(current.items[0]?.entity.label).toBe('NEW SYNTHETIC');expect(current.failure).toBeNull();
  });
  it('clears data and cancels pending details immediately when the year changes',async()=>{
    await mount();await load();const old=deferred();fetchMock.mockReturnValueOnce(old.promise);
    let pending!:Promise<void>;await act(async()=>{pending=current.open(entity);});
    const signal=fetchMock.mock.calls.at(-1)![1]!.signal!;
    fetchMock.mockResolvedValueOnce(reply(context(2091)));await act(async()=>{await current.selectYear(2091);});
    expect(signal.aborted).toBe(true);expect(current.items).toEqual([]);expect(current.detail).toBeNull();
    await act(async()=>{old.resolve(reply(detail));await pending;});
    expect(current.year).toBe(2091);expect(current.detail).toBeNull();
  });
  it('clears all loaded academic data on loss of authorization',async()=>{
    await mount();await load();fetchMock.mockResolvedValueOnce(reply(search()));await act(async()=>{await current.search();});
    fetchMock.mockResolvedValueOnce(reply({state:'not-authorized'},403));await act(async()=>{await current.open(entity);});
    expect(current.failure).toBe('not-authorized');expect(current.year).toBeNull();expect(current.years).toEqual([]);expect(current.context).toBeNull();expect(current.items).toEqual([]);expect(current.detail).toBeNull();
  });
  it('deduplicates a boundary overlap without merging different kinds with the same ID',async()=>{
    await mount();await load();fetchMock.mockResolvedValueOnce(reply(search('ALUNO SINTETICO',2090,100)));await act(async()=>{await current.search();});
    fetchMock.mockResolvedValueOnce(reply({...search(),items:[{entity,description:null},{entity:{kind:'teacher',id:1,label:'DOCENTE SINTETICO'},description:null}]}));
    await act(async()=>{await current.search(100);});expect(current.items).toHaveLength(2);expect(current.nextOffset).toBeNull();
  });
  it('retains a retryable unavailable state rather than inventing empty success after network failure',async()=>{
    await mount();await load();fetchMock.mockRejectedValueOnce(new Error('synthetic-network-error'));
    await act(async()=>{await current.search();});expect(current.failure).toBe('unavailable');expect(current.searched).toBe(false);expect(current.busy.search).toBe(false);
  });
  it('invalidates an in-flight request on unmount',async()=>{
    await mount();await load();const pending=deferred();fetchMock.mockReturnValueOnce(pending.promise);
    let done!:Promise<void>;await act(async()=>{done=current.search();});const signal=fetchMock.mock.calls.at(-1)![1]!.signal!;
    await act(async()=>{root!.unmount();});root=null;expect(signal.aborted).toBe(true);
    await act(async()=>{pending.resolve(reply(search()));await done;});
  });
});

describe('rendered Centrais surface in jsdom (not a visual browser benchmark)',()=>{
  it('runs catalogue, explicit year, search and center through the real HeroUI page',async()=>{
    fetchMock.mockResolvedValueOnce(reply(bootstrap));root=createRoot(host);
    await act(async()=>{root!.render(createElement(RelationalWorkspacePageV2));});
    const button=[...host.querySelectorAll('button')].find((value)=>value.textContent==='Carregar Centrais');
    expect(button).toBeDefined();expect(fetchMock).not.toHaveBeenCalled();
    await act(async()=>{button!.click();});
    // Workers declares an unrelated global Element; runtime here is explicitly jsdom.
    const select=host.querySelector('select[aria-label="Ano letivo"]') as unknown as HTMLSelectElement;
    expect([...select.options].map((value)=>value.value)).toEqual(['','2090','2091']);expect(select.value).toBe('');
    fetchMock.mockResolvedValueOnce(reply(context()));
    await act(async()=>{select.value='2090';select.dispatchEvent(new Event('change',{bubbles:true}));});
    expect(host.querySelector('[aria-label="Resumo cadastral"]')).not.toBeNull();
    fetchMock.mockResolvedValueOnce(reply(search()));
    const form=host.querySelector('form');expect(form).not.toBeNull();
    await act(async()=>{form!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
    const student=[...host.querySelectorAll('button')].find((value)=>value.textContent==='ALUNO SINTETICO');
    expect(student).toBeDefined();fetchMock.mockResolvedValueOnce(reply(detail));
    await act(async()=>{student!.click();});
    expect(host.textContent).toContain('Não informado');
    expect(host.textContent).toContain('Ofertas da turma atual');
    expect(host.textContent).toContain('Consulta somente leitura');
  });
  it('mounts V2 in the existing lazy shell and leaves legacy maintenance preserved but disconnected',()=>{
    const surface=readFileSync('src/platform/gradebook-operational-surface.tsx','utf8');
    const page=readFileSync('src/features/gradebook/operational-workspace/relational-workspace-page-v2.tsx','utf8');
    const hook=readFileSync('src/features/gradebook/operational-workspace/use-relational-workspace-v2.ts','utf8');
    expect(surface).toContain('relational-workspace-page-v2');expect(surface).not.toContain('<TeacherAssignmentMaintenanceWorkspace');
    expect(page).toContain("from '@heroui/react'");expect(page).toContain('onSubmit=');expect(page).toContain('aria-live="polite"');expect(page).toContain('tabIndex={-1}');
    expect(`${page}\n${hook}`).not.toMatch(/localStorage|sessionStorage|indexedDB|caches\.open|Date\.now|getFullYear|from ['"][^'"]*server\//u);
  });
});
