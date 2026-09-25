$ErrorActionPreference = 'Stop'
$branch = 'codex/preview-painel-aluno-admin'
$project = 'ecossistema-escola-testes'
$root = (git rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0 -or (git branch --show-current).Trim() -ne $branch) {
  throw "Deploy the student panel preview only from $branch."
}
Set-Location -LiteralPath $root
$official = Join-Path $root 'wrangler.jsonc'
$preview = Join-Path $root 'wrangler.preview.jsonc'
$codec = Join-Path $root 'node_modules/.cache/student-photo-codec-v1/codec.wasm'
if (!(Test-Path -LiteralPath $preview) -or !(Test-Path -LiteralPath $codec)) {
  throw 'The preview configuration or verified photo codec artifact is missing.'
}
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Preview build failed.' }
$original = [System.IO.File]::ReadAllBytes($official)
$originalHash = (Get-FileHash -LiteralPath $official -Algorithm SHA256).Hash
try {
  Copy-Item -LiteralPath $preview -Destination $official -Force
  npx wrangler pages deploy dist --project-name $project --branch $branch
  if ($LASTEXITCODE -ne 0) { throw 'Preview deploy failed.' }
} finally {
  [System.IO.File]::WriteAllBytes($official, $original)
}
if ((Get-FileHash -LiteralPath $official -Algorithm SHA256).Hash -ne $originalHash) {
  throw 'The official Wrangler configuration was not restored.'
}
