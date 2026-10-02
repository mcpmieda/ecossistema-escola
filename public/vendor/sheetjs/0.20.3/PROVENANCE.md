# SheetJS CE 0.20.3 — full standalone

Original artifact: https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js

Original SRI: `sha384-EnyY0/GSHQGSxSgMwaIPzSESbqoOLSexfnSMN2AP+39Ckmn92stwABZynq1JyzdT`.
`xlsx.full.min.js.txt` contains the unmodified official bytes, including notices and
codepages. `LICENSE` is the official package Apache-2.0 license. The text extension
marks a third-party source asset, not repository JavaScript to rewrite or lint.
The directory attribute disables newline conversion for this one immutable asset,
so Windows and Linux checkouts preserve the same original integrity.
No dependency, workflow, approval policy or lint rule is changed.

The local Vite plugin verifies the original bytes on every load, emits them unchanged
as `/vendor/sheetjs/0.20.3/xlsx.full.min.js` for the DOM loader (same browser SRI),
and serves that exact JavaScript URL in development. The static worker module adds
only context declarations, a duration measurement and exports around the verified
full artifact before normal bundling; it does not replace library functions or
execute source text at runtime. Worker ready also verifies the real version.

Workers use a separately emitted same-origin module URL, with the existing CSP.
No CDN fetch, Blob worker, eval, new Function, Service Worker or academic storage
is introduced. Replacing these bytes or upgrading requires updating the pin and
regression evidence explicitly.
