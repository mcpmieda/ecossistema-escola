import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const UPSTREAM_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
export const UPSTREAM_SHA256 = 'cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41';
export const PATCH_VERSION = '0.20.3-escola-ref1';
// Rejected candidate: reproduction only, never emitted into the site's public assets.
export const ARTIFACT_PATH = 'node_modules/.cache/gradebook-reader-v1/xlsx.escola-ref1.min.js';
export const OUTPUT_SHA256 = 'badf05fdfa2593bed4e8ebe7e4fcd96c2ac95cb4b6a27760686301c88ab839ca';

// Embedded inside make_xlsx_lib, where Ar is the unchanged upstream clone.
// Only Pa's reference-copy call uses this helper. Unknown shapes retain Ar.
export const REFERENCE_COPY_SOURCE = `function escolaCopyRef1(e){
if(typeof JSON==="undefined"||e===null||typeof e!=="object"||Object.getPrototypeOf(e)!==Object.prototype||Object.getOwnPropertyDescriptor(Object.prototype,"toJSON"))return Ar(e);
var keys=Object.keys(e);if(keys.length!==4||keys[0]!=="r"||keys[1]!=="c"||keys[2]!=="cRel"||keys[3]!=="rRel")return Ar(e);
var values=[],i,k,d,v;
for(i=0;i<4;++i){k=keys[i];if(k!=="r"&&k!=="c"&&k!=="rRel"&&k!=="cRel")return Ar(e);d=Object.getOwnPropertyDescriptor(e,k);if(!d||!("value" in d))return Ar(e);v=d.value;if((typeof v!=="number"||!isFinite(v))&&((k!=="rRel"&&k!=="cRel")||typeof v!=="boolean"))return Ar(e);values[i]=v===0?0:v;}
if(Object.getOwnPropertyNames(e).length!==4)return Ar(e);
return {r:values[0],c:values[1],cRel:values[2],rRel:values[3]};
}`;

function replaceExactlyOnce(source, before, after) {
  if (source.split(before).length !== 2) throw new Error('sheetjs-patch-anchor-mismatch');
  return source.replace(before, after);
}

export function patchSheetJsReferenceV1(input) {
  if (createHash('sha256').update(input).digest('hex') !== UPSTREAM_SHA256)
    throw new Error('sheetjs-upstream-integrity-mismatch');
  let source = input.toString('utf8');
  source = replaceExactlyOnce(
    source,
    'function Pa(e,r,t){var a=Ar(e);',
    `${REFERENCE_COPY_SOURCE}\nfunction Pa(e,r,t){var a=escolaCopyRef1(e);`,
  );
  source = replaceExactlyOnce(source, 'e.version="0.20.3";', `e.version="${PATCH_VERSION}";`);
  const output = Buffer.from(
    '/* eslint-disable */\n/*! Local derivative: escola-ref1; see PROVENANCE.md and LICENSE. */\n' +
      source,
  );
  if (createHash('sha256').update(output).digest('hex') !== OUTPUT_SHA256)
    throw new Error('sheetjs-patch-output-integrity-mismatch');
  return output;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.slice(2).some((argument) => argument !== '--check'))
    throw new Error('sheetjs-patch-unsupported-argument');
  const input = await readFile('node_modules/.cache/gradebook-reader-v1/sheetjs-0.20.3.js');
  const output = patchSheetJsReferenceV1(input);
  if (process.argv.includes('--check')) {
    if (!(await readFile(ARTIFACT_PATH)).equals(output))
      throw new Error('sheetjs-artifact-mismatch');
  } else {
    await mkdir('node_modules/.cache/gradebook-reader-v1', { recursive: true });
    await writeFile(ARTIFACT_PATH, output);
  }
  console.log(
    JSON.stringify({
      bytes: output.length,
      sha256: createHash('sha256').update(output).digest('hex'),
      integrity: 'sha384-' + createHash('sha384').update(output).digest('base64'),
    }),
  );
}
