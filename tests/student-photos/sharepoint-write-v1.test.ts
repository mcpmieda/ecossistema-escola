import { describe, expect, it, vi } from 'vitest';
import type { RuntimeEnv } from '../../server/env';
import { GraphError, type GraphDependencies } from '../../server/graph/request-policy-v1';
import { SharePointPhotoTransportV1, type SharePointPhotoActionV1 } from '../../server/student-photos/sharepoint-write-v1';
import type { PhotoAssetV1 } from '../../shared/student-photos/write-v1';

// Header-only synthetic transport fixture, deliberately NOT a successful codec proof.
const bytes = () => {
  const value = new Uint8Array(30), view = new DataView(value.buffer);
  value.set(new TextEncoder().encode('RIFF')); view.setUint32(4,22,true);
  value.set(new TextEncoder().encode('WEBPVP8 '),8); view.setUint32(16,10,true);
  value.set([0x9d,1,0x2a],23); view.setUint16(26,24,true); view.setUint16(28,32,true);
  return value;
};
const digest = async (value: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
  new Uint8Array(value).buffer)), byte => byte.toString(16).padStart(2,'0')).join('');
const env = { SHAREPOINT_SITE_ID: 'synthetic.sharepoint.com,site,web' } as RuntimeEnv;
const library = { driveId: 'synthetic-drive', parentItemId: 'synthetic-folder' };
const context = { studentUid: '10000000-0000-4000-8000-000000000001', actorId: '10000000-0000-4000-8000-000000000002' };
const requestId = '20000000-0000-4000-8000-000000000001';
const name = `${context.studentUid}_${requestId}_portrait.webp`;
const uploadUrl = 'https://synthetic.sharepoint.com/private-upload?secret=synthetic-upload-token';
const parentPath = `/v1.0/drives/${library.driveId}/items/${library.parentItemId}`;
interface RecordV1 { id: string; name: string; data: Uint8Array; etag: string; parent: string; extra?: Record<string, unknown> }
interface Call { url: URL; method: string; headers: Headers; init: RequestInit | undefined }
type Intercept = (call: Call) => Promise<Response | undefined> | Response | undefined;

async function fixture() {
  const source = bytes();
  const input = { context: { ...context }, requestId, variant: 'portrait' as const,
    bytes: source, metadata: { width:24,height:32,byteSize:source.length,sha256:await digest(source) }, signal: new AbortController().signal };
  const files = new Map<string,RecordV1>(), calls: Call[] = [];
  let intercept: Intercept = () => undefined, sessionName = name;
  const install = (data = source, fileName = name): RecordV1 => {
    const record = { id: 'synthetic-item-' + files.size, name:fileName, data:new Uint8Array(data), etag:'"synthetic-v1"',parent:library.parentItemId };
    files.set(fileName,record); return record;
  };
  const metadata = (record: RecordV1) => ({ id:record.id,name:record.name,eTag:record.etag,size:record.data.length,
    file:{mimeType:'image/webp'},parentReference:{driveId:library.driveId,id:record.parent},
    '@microsoft.graph.downloadUrl':`https://synthetic.sharepoint.com/private-download/${record.id}?private=synthetic`, ...record.extra });
  const authorize = vi.fn(async (_action: SharePointPhotoActionV1): Promise<void> => undefined);
  const fetcher: typeof fetch = async (target, init) => {
    const url = new URL(typeof target === 'string' ? target : target instanceof URL ? target.href : target.url);
    const call = { url, method:init?.method ?? 'GET',headers:new Headers(init?.headers),init }; calls.push(call);
    const overridden = await intercept(call); if (overridden) return overridden;
    if (url.origin === 'https://synthetic.sharepoint.com') {
      expect(call.headers.has('Authorization')).toBe(false); expect(call.headers.has('Cookie')).toBe(false);
      expect(call.headers.has('Referer')).toBe(false); expect(init?.credentials).toBe('omit'); expect(init?.redirect).toBe('manual');
      if (url.pathname === '/private-upload' && call.method === 'PUT') {
        if (files.has(sessionName)) return new Response(null,{status:409});
        install(new Uint8Array(await new Response(init?.body).arrayBuffer()),sessionName);
        return Response.json({ id:'untrusted-response-item',size:1 },{status:201});
      }
      const record = [...files.values()].find(file => url.pathname === '/private-download/' + file.id);
      if (record) return new Response(new Uint8Array(record.data),{headers:{'Content-Length':String(record.data.length)}});
    }
    expect(url.origin).toBe('https://graph.microsoft.com'); expect(init?.redirect).toBe('manual');
    expect(call.headers.get('Authorization')).toBe('Bearer synthetic-graph-token');
    if (url.pathname === parentPath) return Response.json({id:library.parentItemId,folder:{}});
    if (url.pathname.endsWith(':/createUploadSession')) {
      const body = JSON.parse(String(init?.body));
      expect(body.item['@microsoft.graph.conflictBehavior']).toBe('fail'); expect(body.deferCommit).toBe(false);
      sessionName = body.item.name;
      expect(url.pathname).toBe(parentPath + ':/' + sessionName + ':/createUploadSession');
      return Response.json({uploadUrl,expirationDateTime:new Date(Date.now()+60000).toISOString()});
    }
    const record = [...files.values()].find(file => url.pathname === parentPath + ':/' + file.name
      || url.pathname === `/v1.0/drives/${library.driveId}/items/${file.id}`);
    if (!record) return new Response(null,{status:404});
    if (call.method === 'DELETE') {
      expect(call.headers.has('Prefer')).toBe(false);
      if (call.headers.get('If-Match') !== record.etag) return new Response(null,{status:412});
      files.delete(record.name); return new Response(null,{status:204});
    }
    return Response.json(metadata(record));
  };
  const dependencies: GraphDependencies = {fetch:fetcher,sleep:async () => undefined};
  const transport = new SharePointPhotoTransportV1({env,library,authorize,dependencies,token:'synthetic-graph-token'});
  const asset = (record: RecordV1): PhotoAssetV1 => ({...input.metadata,driveId:library.driveId,itemId:record.id,etag:record.etag});
  return { input,files,calls,install,asset,authorize,transport,metadata, intercept: (value: Intercept) => { intercept=value; } };
}

describe('SharePoint photo create-only transport', () => {
  it('uploads once, verifies the actual path and bytes, and never forwards Graph authority to temporary URLs', async () => {
    const f=await fixture(), result=await f.transport.upload(f.input);
    expect(result).toEqual(f.asset([...f.files.values()][0]!)); expect(result.itemId).not.toBe('untrusted-response-item');
    const uploads=f.calls.filter(call=>call.method==='PUT'); expect(uploads).toHaveLength(1);
    expect(uploads[0]!.headers.get('Content-Range')).toBe('bytes 0-29/30');
    expect(uploads[0]!.headers.get('Content-Length')).toBe('30');
    expect(f.calls.filter(call=>call.method==='POST')).toHaveLength(1);
    expect(f.authorize.mock.calls.every(([action])=>action.kind==='upload')).toBe(true);
    expect(f.input.bytes).toEqual(bytes());
  });
  it('reconciles an identical retry without another session or upload', async () => {
    const f=await fixture(); f.install();
    await expect(f.transport.upload(f.input)).resolves.toMatchObject({sha256:f.input.metadata.sha256});
    expect(f.calls.some(call=>call.method!=='GET')).toBe(false);
  });
  it('rejects equal-size different content at the deterministic key without overwriting it', async () => {
    const f=await fixture(), wrong=bytes(); wrong[20]=1; f.install(wrong);
    await expect(f.transport.upload(f.input)).rejects.toMatchObject({status:409});
    expect(f.calls.every(call=>call.method==='GET')).toBe(true); expect(f.files.get(name)!.data).toEqual(wrong);
  });
  it('recovers a lost successful PUT response by verifying remote content, without a second write', async () => {
    const f=await fixture();
    f.intercept(call=>{if(call.method==='PUT'){f.install();throw new Error('synthetic-lost-response');}});
    await expect(f.transport.upload(f.input)).resolves.toMatchObject({sha256:f.input.metadata.sha256});
    expect(f.calls.filter(call=>call.method==='PUT')).toHaveLength(1);
    expect(f.calls.filter(call=>call.method==='POST')).toHaveLength(1);
  });
  it('leaves an ambiguous failed upload unresolved rather than repeating it or deleting old files', async () => {
    const f=await fixture(); f.intercept(call=>{if(call.method==='PUT')throw new Error(uploadUrl);});
    await expect(f.transport.upload(f.input)).rejects.toMatchObject({status:503,message:'Graph request failed (503)'});
    expect(f.calls.filter(call=>call.method==='PUT')).toHaveLength(1); expect(f.files.size).toBe(0);
    expect(f.calls.some(call=>call.method==='DELETE')).toBe(false);
  });
  it('accepts a racing identical commit but rejects racing different bytes', async () => {
    for (const same of [true,false]) {
      const f=await fixture(); f.intercept(call=>{if(call.method==='PUT'){
        const value=bytes(); if(!same)value[20]=1; f.install(value); return new Response(null,{status:409});
      }});
      const promise=f.transport.upload(f.input);
      if(same)await expect(promise).resolves.toMatchObject({sha256:f.input.metadata.sha256});
      else await expect(promise).rejects.toMatchObject({status:409});
      expect(f.calls.filter(call=>call.method==='PUT')).toHaveLength(1);
    }
  });
  it.each([400,401,403,423,429])('does not retry or bypass a definitive PUT rejection (%s)',async status=>{
    const f=await fixture(); f.intercept(call=>call.method==='PUT'?new Response(null,{status,headers:{'Retry-After':'60'}}):undefined);
    await expect(f.transport.upload(f.input)).rejects.toMatchObject({status,retryAfterSeconds:60});
    expect(f.calls.filter(call=>call.method==='PUT')).toHaveLength(1);
    expect(f.calls.at(-1)!.method).toBe('PUT');
  });
  it.each([
    'https://attacker.invalid/upload', 'http://synthetic.sharepoint.com/upload',
    'https://synthetic.sharepoint.com.attacker.invalid/upload', 'https://user:pass@synthetic.sharepoint.com/upload',
    'https://synthetic.sharepoint.com:444/upload','https://synthetic.sharepoint.com/upload#fragment',
  ])('rejects a session URL outside the exact configured tenant: %s',async upload=>{
    const f=await fixture(); f.intercept(call=>call.method==='POST'?Response.json({uploadUrl:upload,expirationDateTime:new Date(Date.now()+60000).toISOString()}):undefined);
    await expect(f.transport.upload(f.input)).rejects.toBeInstanceOf(GraphError);
    expect(f.calls.some(call=>call.method==='PUT')).toBe(false);
    expect(f.calls.every(call=>call.url.origin==='https://graph.microsoft.com')).toBe(true);
  });
  it('rejects expired sessions without sending any photo bytes',async()=>{
    const f=await fixture(); f.intercept(call=>call.method==='POST'?Response.json({uploadUrl,expirationDateTime:'2000-01-01T00:00:00Z'}):undefined);
    await expect(f.transport.upload(f.input)).rejects.toMatchObject({status:502});
    expect(f.calls.some(call=>call.method==='PUT')).toBe(false);
  });
  it.each([202,302,307])('does not follow upload redirects or treat non-final response %s as confirmation',async status=>{
    const f=await fixture(); f.intercept(call=>call.method==='PUT'?new Response(null,{status,headers:{Location:'https://attacker.invalid/'}}):undefined);
    await expect(f.transport.upload(f.input)).rejects.toMatchObject({status:502});
    expect(f.calls.filter(call=>call.method==='PUT')).toHaveLength(1);
    expect(f.calls.some(call=>call.url.hostname==='attacker.invalid')).toBe(false);
  });
  it('rejects claimed hashes and dimensions before any storage I/O',async()=>{
    for(const change of [{sha256:'0'.repeat(64)},{width:27,height:36}]){
      const f=await fixture();
      await expect(f.transport.upload({...f.input,metadata:{...f.input.metadata,...change}})).rejects.toMatchObject({status:400});
      expect(f.calls).toHaveLength(0);
    }
  });
  it('stops before bytes are sent when authority is lost after creating the session',async()=>{
    const f=await fixture(); let created=false;
    f.intercept(call=>{if(call.method==='POST')created=true;});
    f.authorize.mockImplementation(async()=>{if(created)throw new Error('permission-lost');});
    await expect(f.transport.upload(f.input)).rejects.toMatchObject({status:403});
    expect(f.calls.some(call=>call.method==='PUT')).toBe(false);
  });
  it('does no I/O without authorization or after cancellation',async()=>{
    const f=await fixture(); f.authorize.mockRejectedValue(new Error('private policy detail'));
    await expect(f.transport.upload(f.input)).rejects.toMatchObject({status:403,message:'Graph request failed (403)'});
    expect(f.calls).toHaveLength(0);
    const controller=new AbortController(); controller.abort();
    await expect(f.transport.upload({...f.input,signal:controller.signal})).rejects.toBeDefined();
    expect(f.calls).toHaveLength(0);
  });
  it('does not certify bytes when the remote ETag changes during verification',async()=>{
    const f=await fixture(), record=f.install();
    f.intercept(call=>{if(call.url.pathname.startsWith('/private-download/'))record.etag='"changed"';});
    await expect(f.transport.upload(f.input)).rejects.toMatchObject({status:409});
    expect(f.calls.some(call=>call.method!=='GET')).toBe(false);
  });
});

describe('SharePoint photo conditional removal',()=>{
  it('deletes only the exact authorized retired reference with a strong If-Match and no bypass preference',async()=>{
    const f=await fixture(), record=f.install();
    await expect(f.transport.remove(f.asset(record),f.input.signal)).resolves.toBe('deleted');
    expect(f.files.size).toBe(0); const deletes=f.calls.filter(call=>call.method==='DELETE');
    expect(deletes).toHaveLength(1); expect(deletes[0]!.headers.get('If-Match')).toBe(record.etag);
    expect(deletes[0]!.url.pathname).toBe(`/v1.0/drives/${library.driveId}/items/${record.id}`);
    expect(f.calls.some(call=>call.url.pathname.includes('permanentDelete'))).toBe(false);
  });
  it('records absence separately and does not confuse an inaccessible library with an absent file',async()=>{
    const f=await fixture(), record=f.install(), asset=f.asset(record); f.files.clear();
    await expect(f.transport.remove(asset,f.input.signal)).resolves.toBe('already-absent');
    expect(f.calls.some(call=>call.method==='DELETE')).toBe(false);
    f.intercept(call=>call.url.pathname===parentPath?new Response(null,{status:404}):undefined);
    await expect(f.transport.remove(asset,f.input.signal)).rejects.toMatchObject({status:404});
  });
  it.each(['*','"v1", "v2"','W/"v1"','"v1"\r\nX-Evil: yes'])('rejects unsafe or non-strong ETag %s before I/O',async etag=>{
    const f=await fixture(), record=f.install();
    await expect(f.transport.remove({...f.asset(record),etag},f.input.signal)).rejects.toMatchObject({status:400});
    expect(f.calls).toHaveLength(0);
  });
  it('rejects the wrong drive, moved items and changed versions without deletion',async()=>{
    const f=await fixture(), record=f.install(), asset=f.asset(record);
    await expect(f.transport.remove({...asset,driveId:'other-drive'},f.input.signal)).rejects.toMatchObject({status:400});
    record.parent='other-folder'; await expect(f.transport.remove(asset,f.input.signal)).rejects.toMatchObject({status:409});
    record.parent=library.parentItemId; record.etag='"v2"';
    await expect(f.transport.remove(asset,f.input.signal)).rejects.toMatchObject({status:412});
    expect(f.calls.some(call=>call.method==='DELETE')).toBe(false);
  });
  it.each(['folder','package','remoteItem','deleted'])('never deletes a descriptor with the %s facet',async facet=>{
    const f=await fixture(), record=f.install(); record.extra={[facet]:{}};
    await expect(f.transport.remove(f.asset(record),f.input.signal)).rejects.toMatchObject({status:502});
    expect(f.calls.some(call=>call.method==='DELETE')).toBe(false);
  });
  it('preserves a concurrent remote edit instead of retrying DELETE without its condition',async()=>{
    const f=await fixture(), record=f.install(), asset=f.asset(record);
    f.intercept(call=>{if(call.method==='DELETE')record.etag='"remote-edit"';});
    await expect(f.transport.remove(asset,f.input.signal)).rejects.toMatchObject({status:412});
    expect(f.files.size).toBe(1); expect(f.calls.filter(call=>call.method==='DELETE')).toHaveLength(1);
  });
  it('keeps deletion ambiguous after a lost response; a later authorized retry reports absence',async()=>{
    const f=await fixture(), record=f.install(), asset=f.asset(record);
    f.intercept(call=>{if(call.method==='DELETE'){f.files.clear();throw new Error('response-lost');}});
    await expect(f.transport.remove(asset,f.input.signal)).rejects.toMatchObject({status:503});
    await expect(f.transport.remove(asset,f.input.signal)).resolves.toBe('already-absent');
    expect(f.calls.filter(call=>call.method==='DELETE')).toHaveLength(1);
  });
  it('rechecks permission immediately before deletion',async()=>{
    const f=await fixture(), record=f.install(); let reads=0;
    f.intercept(call=>{if(call.url.pathname.endsWith('/'+record.id))reads++;});
    f.authorize.mockImplementation(async()=>{if(reads)throw new Error('revoked');});
    await expect(f.transport.remove(f.asset(record),f.input.signal)).rejects.toMatchObject({status:403});
    expect(f.calls.some(call=>call.method==='DELETE')).toBe(false); expect(f.files.size).toBe(1);
  });
});
