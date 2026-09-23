import { z } from 'zod';
import type { RuntimeEnv } from '../env';
import { graphRequest } from '../graph/client';
import { photoAssetV1, PhotoWriteErrorV1, type PhotoWriteContextV1, type PhotoAssetV1 } from '../../shared/student-photos/write-v1';
import { photoLibraryV1 } from './library-v1';
import { readSharePointPhotoV1 } from './sharepoint-download-v1';
import { PhotoCatalogRepositoryV1, type LegacyPhotoReferenceV1 } from './catalog-repository-v1';
import type { StudentWebpCodecV1 } from './webp-codec-v1';

/** Adopts only the explicitly linked original. Reads never initialize an empty
 * family or publish; the authenticated open/sync action owns those mutations. */
export class PhotoCatalogServiceV1 {
  constructor(private readonly env: RuntimeEnv,readonly repository: PhotoCatalogRepositoryV1,
    private readonly codec: Pick<StudentWebpCodecV1,'validate'>,
    private readonly authorize:(context:PhotoWriteContextV1)=>Promise<void>) {}
  private async canonical(context:PhotoWriteContextV1,asset:PhotoAssetV1,signal:AbortSignal) {
    await this.authorize(context); signal.throwIfAborted();
    const library=photoLibraryV1(this.env);
    if(asset.driveId!==library.driveId) throw new PhotoWriteErrorV1('invalid');
    const read=await readSharePointPhotoV1({env:this.env,driveId:asset.driveId,itemId:asset.itemId,expectedETag:asset.etag,signal});
    try {
      await this.codec.validate(read.bytes,'portrait',signal);
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(read.bytes).buffer)),b=>b.toString(16).padStart(2,'0')).join('');
      if(hash!==asset.sha256 || read.bytes.length!==asset.byteSize) throw new PhotoWriteErrorV1('conflict');
      await this.authorize(context); return read.bytes;
    } catch(error){read.bytes.fill(0);throw error;}
  }
  private async legacy(context:PhotoWriteContextV1,reference:LegacyPhotoReferenceV1,signal:AbortSignal) {
    await this.authorize(context); signal.throwIfAborted();
    const library=photoLibraryV1(this.env);
    if(reference.driveId!==library.driveId) throw new PhotoWriteErrorV1('conflict');
    const path=`/drives/${encodeURIComponent(library.driveId)}/items/${encodeURIComponent(reference.itemId)}`;
    const meta=z.object({id:z.string(),name:z.string(),eTag:z.string(),size:z.number(),
      parentReference:z.object({driveId:z.string(),id:z.string()}),file:z.object({mimeType:z.literal('image/webp')}),
      folder:z.never().optional(),remoteItem:z.never().optional()}).parse(
        (await graphRequest<unknown>({env:this.env,path:path+'?$select=id,name,eTag,size,parentReference,file,folder,remoteItem',signal})).data);
    if(meta.id!==reference.itemId || meta.name.toLowerCase()!==reference.accountId+'.webp'
      || meta.parentReference.driveId!==library.driveId || meta.parentReference.id!==library.parentItemId
      || meta.size!==reference.byteSize) throw new PhotoWriteErrorV1('conflict');
    const read=await readSharePointPhotoV1({env:this.env,driveId:library.driveId,itemId:meta.id,expectedETag:meta.eTag,signal});
    try {
      const size=await this.codec.validate(read.bytes,'portrait',signal);
      const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(read.bytes).buffer)),b=>b.toString(16).padStart(2,'0')).join('');
      const asset=photoAssetV1.parse({driveId:library.driveId,itemId:meta.id,etag:read.etag,
        byteSize:read.bytes.length,sha256,...size});
      await this.authorize(context); return {asset,bytes:read.bytes};
    } catch(error){read.bytes.fill(0);throw error;}
  }
  async open(context:PhotoWriteContextV1,signal:AbortSignal) {
    await this.authorize(context);
    let family=await this.repository.family(context.studentUid);
    if(!family){
      const reference=await this.repository.legacy(context.studentUid);
      if(reference){
        const original=await this.legacy(context,reference,signal);
        try {
          await this.authorize(context); signal.throwIfAborted();
          await this.repository.initialize(context,reference,original.asset);
          await this.authorize(context); signal.throwIfAborted();
          await this.repository.publish(context,'portrait',original.asset,original.bytes);
        } finally{original.bytes.fill(0);}
      }else{
        await this.authorize(context); signal.throwIfAborted();
        await this.repository.initialize(context,null,null);
      }
      family=await this.repository.family(context.studentUid);
    }
    if(family?.assets.portrait){
      const cached=await this.repository.image(context.studentUid,'portrait');
      if(cached) cached.bytes.fill(0);
      else {
        const bytes=await this.canonical(context,family.assets.portrait,signal);
        try {await this.authorize(context);signal.throwIfAborted();await this.repository.publish(context,'portrait',family.assets.portrait,bytes);}
        finally{bytes.fill(0);}
      }
    }
    await this.authorize(context); return this.repository.state(context);
  }
  async read(context:PhotoWriteContextV1,variant:'portrait'|'avatar',revision:string|null,signal:AbortSignal) {
    await this.authorize(context); signal.throwIfAborted();
    const family=await this.repository.family(context.studentUid);
    if(revision!==null && family?.revision!==revision) return null;
    const cached=await this.repository.image(context.studentUid,variant);
    if(cached){
      try{await this.authorize(context);signal.throwIfAborted();return cached.bytes;}
      catch(error){cached.bytes.fill(0);throw error;}
    }
    if(family){
      const asset=family.assets[variant] ?? family.assets.portrait;
      if(!asset) return null;
      // Canonical writes already decoded these pixels. Read the exact file, never
      // substitute another revision after a failed ETag check.
      const read=await readSharePointPhotoV1({env:this.env,driveId:asset.driveId,itemId:asset.itemId,expectedETag:asset.etag,signal});
      try{await this.authorize(context);signal.throwIfAborted();return read.bytes;}
      catch(error){read.bytes.fill(0);throw error;}
    }
    const reference=await this.repository.legacy(context.studentUid);
    if(!reference)return null;
    return (await this.legacy(context,reference,signal)).bytes;
  }
}
