import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { PhotoCatalogRepositoryV1 } from '../../../server/student-photos/catalog-repository-v1';
import { PhotoWriteRepositoryV1, type PhotoWriteDatabaseV1 } from '../../../server/student-photos/write-repository-v1';
import { photoWriteFingerprintV1, type PhotoAssetV1, type PhotoWriteContextV1 } from '../../../shared/student-photos/write-v1';

const target=new URL(process.env.PORTAL_TEST_DATABASE_URL??'http://invalid');
if(target.protocol!=='postgres:'||target.hostname!=='127.0.0.1'||target.pathname!=='/portal705_test'||target.search||target.hash)
  throw new Error('Photo catalog tests require disposable local PostgreSQL');
const cluster=postgres(target.toString(),{max:1,onnotice:()=>undefined});
const name='photo_runtime_'+crypto.randomUUID().replaceAll('-','').slice(0,12);
let db:ReturnType<typeof postgres>;let created=false;
let portrait:Uint8Array,avatar:Uint8Array;
const actor=crypto.randomUUID();
function adapter():PhotoWriteDatabaseV1{return{transaction:async work=>{
  const box=await db.begin(async tx=>{
    await tx.unsafe('SET LOCAL ROLE gradebook_app');
    return{value:await work({query:async(text,parameters=[])=>Array.from(await tx.unsafe(text,[...parameters] as never[]))})};
  });return box.value;
}};}
function asset(bytes:Uint8Array,width:number,height:number,itemId:string):PhotoAssetV1{
  return{driveId:'synthetic-drive',itemId,etag:'"synthetic-etag-'+itemId+'"',width,height,byteSize:bytes.length,
    sha256:createHash('sha256').update(bytes).digest('hex')};
}
async function person(legacy=false){
  const context:PhotoWriteContextV1={studentUid:crypto.randomUUID(),actorId:actor};
  const accountId=crypto.randomUUID();
  await db.unsafe('INSERT INTO gradebook.student_identity(id) VALUES($1)',[context.studentUid]);
  await db.unsafe('INSERT INTO student_portal.account(id,student_uid,academic_year) VALUES($1,$2,2026)',[accountId,context.studentUid]);
  if(legacy)await db.unsafe(`INSERT INTO student_portal.profile_photo(account_id,sharepoint_drive_id,sharepoint_item_id,content_type,byte_size,etag)
    VALUES($1,'synthetic-drive',$2,'image/webp',$3,'"synthetic-legacy"')`,[accountId,'old-'+accountId,portrait.length]);
  return{context,accountId,catalog:new PhotoCatalogRepositoryV1(adapter()),writer:new PhotoWriteRepositoryV1(adapter(),true)};
}
beforeAll(async()=>{
  await cluster.unsafe('CREATE DATABASE '+name);created=true;
  const url=new URL(target);url.pathname='/'+name;db=postgres(url.toString(),{max:1,onnotice:()=>undefined});
  // Targeted native schema fixture: image operations only, no student names or school data.
  await db.unsafe(`CREATE SCHEMA gradebook;CREATE TABLE gradebook.student_identity(id uuid PRIMARY KEY);
    CREATE TABLE gradebook.aluno(id integer PRIMARY KEY,ano integer,student_uid uuid REFERENCES gradebook.student_identity(id));
    CREATE SCHEMA student_portal;CREATE TABLE student_portal.account(id uuid PRIMARY KEY,academic_year integer,student_uid uuid REFERENCES gradebook.student_identity(id));`,[],{prepare:false});
  for(const file of ['0001_private_delivery_v1.sql','0002_write_journal_v1.sql','0003_runtime_catalog_v1.sql','0004_resumable_payload_v1.sql'])
    await db.unsafe(readFileSync('migrations/student-photos/'+file,'utf8'),[],{prepare:false});
  portrait=new Uint8Array(await sharp({create:{width:30,height:40,channels:3,background:'#446699'}}).webp({quality:92}).toBuffer());
  avatar=new Uint8Array(await sharp({create:{width:32,height:32,channels:3,background:'#446699'}}).webp({quality:92}).toBuffer());
},30_000);
afterAll(async()=>{await db?.end({timeout:2});if(created)await cluster.unsafe('DROP DATABASE '+name);await cluster.end({timeout:2});});

it('adopts the exact legacy link and publishes unchanged original bytes without renaming or new consent input',async()=>{
  const p=await person(true),reference=await p.catalog.legacy(p.context.studentUid);
  expect(reference?.accountId).toBe(p.accountId);
  const original=asset(portrait,30,40,reference!.itemId);
  await p.catalog.initialize(p.context,reference,original);
  await p.catalog.publish(p.context,'portrait',original,portrait);
  const first=await p.catalog.image(p.context.studentUid,'portrait');
  expect(first?.bytes).toEqual(portrait);
  await p.catalog.publish(p.context,'portrait',original,portrait);
  expect((await p.catalog.image(p.context.studentUid,'portrait'))?.revision).toBe(first?.revision);
  const rows=await db.unsafe('SELECT image_use_authorized,authorization_reference,encode(image_webp,\'hex\') AS image FROM student_photos.portal_delivery_v1 WHERE student_uid=$1',[p.context.studentUid]);
  expect(rows[0]!.image_use_authorized).toBe(true);
  expect(rows[0]!.authorization_reference).toBe('enrollment-authorization-confirmed-2026-09-23');
  expect(rows[0]!.image).toBe(Buffer.from(portrait).toString('hex'));
  expect((await db.unsafe('SELECT version FROM student_portal.profile_photo WHERE account_id=$1',[p.accountId]))[0]!.version).toBe('1');
});
it('does not interpret a legacy photo as absence and rejects a changed adoption snapshot',async()=>{
  const p=await person(true),reference=await p.catalog.legacy(p.context.studentUid);
  await expect(p.catalog.initialize(p.context,reference,null)).rejects.toThrow('photo-legacy-not-absent');
  await db.unsafe('UPDATE student_portal.profile_photo SET version=version+1 WHERE account_id=$1',[p.accountId]);
  await expect(p.catalog.initialize(p.context,reference,asset(portrait,30,40,reference!.itemId))).rejects.toThrow('photo-legacy-changed');
  expect(await p.catalog.family(p.context.studentUid)).toBeNull();
});
it('resolves account and academic reference to the same canonical person',async()=>{
  const p=await person();
  await db.unsafe('INSERT INTO gradebook.aluno(id,ano,student_uid) VALUES(71,2026,$1)',[p.context.studentUid]);
  expect(await p.catalog.resolve({source:'portal',academicYear:2026,accountIds:[p.accountId]})).toBe(p.context.studentUid);
  expect(await p.catalog.resolve({source:'gradebook',academicYear:2026,studentIds:[71]})).toBe(p.context.studentUid);
  await expect(p.catalog.resolve({source:'gradebook',academicYear:2027,studentIds:[71]})).rejects.toThrow('not-found');
});
it('reserves recovery pixels atomically and rolls the reservation back on a wrong hash',async()=>{
  const p=await person();await p.catalog.initialize(p.context,null,null);
  const plan={portrait:asset(portrait,30,40,'new-main'),avatar:asset(avatar,32,32,'new-avatar')};
  const command={requestId:crypto.randomUUID(),expectedRevision:null,kind:'replace' as const};
  await expect(p.writer.claim(p.context,command,plan,{portrait:new Uint8Array(portrait.length),avatar})).rejects.toThrow('photo-payload-mismatch');
  expect((await p.catalog.family(p.context.studentUid))?.pending).toBeNull();
  expect((await db.unsafe('SELECT request_id FROM student_photos.write_payload_v1 WHERE request_id=$1',[command.requestId])).length).toBe(0);
  await p.writer.claim(p.context,command,plan,{portrait,avatar});
  expect((await db.unsafe('SELECT request_id FROM student_photos.write_payload_v1 WHERE request_id=$1',[command.requestId])).length).toBe(1);
});
it('publishes committed pixels and deletes temporary recovery pixels only after finalization',async()=>{
  const p=await person();await p.catalog.initialize(p.context,null,null);
  const command={requestId:crypto.randomUUID(),expectedRevision:null,kind:'replace' as const};
  const assets={portrait:asset(portrait,30,40,'p-'+command.requestId),avatar:asset(avatar,32,32,'a-'+command.requestId)};
  await p.writer.claim(p.context,command,assets,{portrait,avatar});
  await p.writer.commit(p.context,command.requestId,assets);
  await p.catalog.publish(p.context,'portrait',assets.portrait,portrait);await p.catalog.publish(p.context,'avatar',assets.avatar,avatar);
  await p.writer.complete(p.context,command.requestId);
  expect((await p.catalog.state(p.context)).portalReady).toBe(true);
  expect((await db.unsafe('SELECT request_id FROM student_photos.write_payload_v1 WHERE request_id=$1',[command.requestId])).length).toBe(0);
  expect((await db.unsafe('SELECT sharepoint_item_id FROM student_portal.profile_photo WHERE account_id=$1',[p.accountId]))[0]!.sharepoint_item_id).toBe(assets.portrait.itemId);
  const image=await p.catalog.image(p.context.studentUid,'portrait');
  const remove={requestId:crypto.randomUUID(),expectedRevision:command.requestId,kind:'remove' as const};
  await p.writer.claim(p.context,remove,{portrait:null,avatar:null},{portrait:null,avatar:null});
  expect(await p.catalog.image(p.context.studentUid,'portrait')).toBeNull();
  expect((await db.unsafe('SELECT image_webp FROM student_photos.portal_delivery_v1 WHERE student_uid=$1',[p.context.studentUid]))[0]!.image_webp).toBeNull();
  expect((await db.unsafe('SELECT account_id FROM student_portal.profile_photo WHERE account_id=$1',[p.accountId])).length).toBe(0);
  expect(image?.bytes).toEqual(portrait);
});
it('audits explicit recovery by another authorized operator and fences the old receipt owner',async()=>{
  const p=await person();await p.catalog.initialize(p.context,null,null);
  const command={requestId:crypto.randomUUID(),expectedRevision:null,kind:'replace' as const};
  const assets={portrait:asset(portrait,30,40,'p-'+command.requestId),avatar:asset(avatar,32,32,'a-'+command.requestId)};
  const receipt=await p.writer.claim(p.context,command,assets,{portrait,avatar});
  const next={...p.context,actorId:crypto.randomUUID()};
  const fingerprint=await photoWriteFingerprintV1(next,command,receipt.plan);
  await adapter().transaction(tx=>tx.query('SELECT student_photos.takeover_write_v1($1::uuid,$2::uuid,$3::uuid,$4)',[next.studentUid,next.actorId,command.requestId,fingerprint]));
  await expect(p.writer.commit(p.context,command.requestId,assets)).rejects.toThrow('receipt-conflict');
  expect((await p.writer.commit(next,command.requestId,assets)).actorId).toBe(next.actorId);
  expect((await db.unsafe('SELECT previous_actor::text,acting_actor::text FROM student_photos.recovery_audit_v1 WHERE request_id=$1',[command.requestId]))[0]).toMatchObject({previous_actor:p.context.actorId,acting_actor:next.actorId});
});
it('rejects stale publication and prevents Portal or public roles from writing the catalog',async()=>{
  const p=await person(true),reference=await p.catalog.legacy(p.context.studentUid),original=asset(portrait,30,40,reference!.itemId);
  await p.catalog.initialize(p.context,reference,original);
  await expect(p.catalog.publish(p.context,'portrait',{...original,itemId:'wrong-item'},portrait)).rejects.toThrow('photo-publication-conflict');
  await expect(db.begin(async tx=>{await tx.unsafe('SET LOCAL ROLE student_portal_app');await tx.unsafe('DELETE FROM student_photos.asset_delivery_v1 WHERE student_uid=$1',[p.context.studentUid]);})).rejects.toThrow('permission denied');
  for(const role of ['gradebook_app','student_portal_app']){
    const rows=await db.unsafe("SELECT has_table_privilege($1,'student_photos.asset_delivery_v1','INSERT') AS insert_ok,has_table_privilege($1,'student_photos.write_payload_v1','UPDATE') AS update_ok",[role]);
    expect(rows[0]).toMatchObject({insert_ok:false,update_ok:false});
  }
});
