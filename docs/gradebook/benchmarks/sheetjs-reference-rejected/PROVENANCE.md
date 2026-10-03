# SheetJS full 0.20.3 — escola-ref1

This rejected candidate is reproducible in an ignored local cache only. It is not loaded or shipped by the product. It is not the intact official release.
Upstream copyright notices remain in the artifact. The accompanying `LICENSE`
is the upstream Apache 2.0 license from
<https://cdn.sheetjs.com/xlsx-0.20.3/package/LICENSE>.

- Original: <https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js>
- Original SHA-256: `cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41`
- Derived version: `0.20.3-escola-ref1`
- Derived artifact: `xlsx.escola-ref1.min.js` (immutable name for these bytes)
- Derived SHA-256: `badf05fdfa2593bed4e8ebe7e4fcd96c2ac95cb4b6a27760686301c88ab839ca`
- Derived SRI: `sha384-C2PoaIUwiIigcVcFviGagFXsCGgPxVJ0KKZ1zAfMgMDPpqwAGHpXA1+W1u9Vj63x`
- Authorization: issue #1225, comment 5963405108.

## Exact modification and reproduction

`scripts/gradebook/patch-sheetjs-reference-v1.mjs` is the readable patch source.
It checks the exact upstream SHA-256, requires exactly one occurrence of each
of two anchors (Pa's clone call and the version assignment), and verifies the
derived SHA-256. It adds an identification/lint header for third-party code.
There is no transpilation, wholesale minification or global clone replacement.

From the repository root, with the official bytes in the existing cache:

```sh
node scripts/gradebook/patch-sheetjs-reference-v1.mjs
node scripts/gradebook/patch-sheetjs-reference-v1.mjs --check
```

The CLI only reads the fixed cache path above; arbitrary input paths are rejected.
Downloading must never replace the digest verification. New bytes
require a new variant name, digest and loader integrity, never silent reuse.

## Scope and assumptions

Only `Pa`'s `Ar(e)` reference clone is specialized. The helper accepts plain
objects with exactly four own enumerable data properties: `r`, `c`, `cRel`,
`rRel`, in that exact order. Other orders use the original clone. Coordinates
must be finite numbers; relative flags may also be booleans.
Property order and numeric/boolean types are retained. Negative zero becomes
positive zero, matching the original JSON round-trip. New result objects are
independent object literals, so inherited setters or non-writable properties
cannot intercept creation of their own fields. Additional non-enumerable properties, accessors, `toJSON`, custom
prototypes, missing fields and unsupported values use the unchanged `Ar`.
Symbol keys are ignored as by the original JSON branch. The guard reads property
descriptors without executing getters. Without JSON it uses the original path.

The reference constructors behind `PtgRef`, `PtgRefN`, `PtgRef3d`, `PtgArea` and
`PtgAreaN` produce these plain data objects (normally in r,c,cRel,rRel order with
numeric flags 0/1). Pa's other two calls shift La's cloned range endpoints.
The legacy ELF reference with `fQuoted` is not specialized. `La`, `Ma`, `Md`,
all offsets/wraps and the generic `Ar` remain byte-for-byte unchanged. The helper
is internal; it does not promise observational equivalence for arbitrary Proxy
objects or a monkey-patched JSON implementation not created by these call sites.

The generated artifact is written byte-for-byte into
`node_modules/.cache/gradebook-reader-v1/xlsx.escola-ref1.min.js`, never `public/`.
Its computed digest and SRI are checked; no Git line-ending conversion applies
to this untracked output. The official loader and test helper remain unchanged.

## Rejection and known limitation

The heavy original improved locally, but all five light-control pairs were
slower. Promotion was rejected; no new candidate is published. Further focused
review found that an inherited numeric setter can intercept the temporary
`values` array assignments. A regression explicitly demonstrates this divergence
from the original. The candidate is retained only as reproducible evidence,
not as an approved alternative. No automatic further experiment is planned.
See `../../IMPORT_PERFORMANCE_V11.md` and the adjacent benchmark reports.
