<#
.SYNOPSIS
  Regenerates shared TypeScript types and Python Pydantic models from contracts/.

.DESCRIPTION
  Runs codegen for both packages/shared-ts and packages/shared-py.
  Called by CI to verify generated files are not stale.

  Prerequisites:
    - Node.js + npm (with json-schema-to-typescript installed in shared-ts)
    - Python 3.11+ with datamodel-code-generator installed (pip install datamodel-code-generator)

.EXAMPLE
  # Regenerate everything
  ./scripts/generate-types.ps1

  # CI check — fail if generated files are out of sync with contracts
  ./scripts/generate-types.ps1 -CiCheck
#>
param(
  [switch]$CiCheck
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

Write-Host ""
Write-Host "=== Generating TypeScript types from contracts/ ===" -ForegroundColor Cyan
Set-Location "$Root\packages\shared-ts"
npm install --silent
npm run generate
npm run build:no-gen

Write-Host ""
Write-Host "=== Generating Python Pydantic models from contracts/ ===" -ForegroundColor Cyan
Set-Location "$Root\packages\shared-py"
python scripts/generate.py

Set-Location $Root

if ($CiCheck) {
  Write-Host ""
  Write-Host "=== CI check: verifying generated files are up to date ===" -ForegroundColor Cyan
  $changed = git diff --name-only packages/shared-ts/src/generated packages/shared-py/ragspace_shared/generated
  if ($changed) {
    Write-Host "ERROR: Generated files are out of sync with contracts/. Run ./scripts/generate-types.ps1 and commit the result." -ForegroundColor Red
    Write-Host $changed
    exit 1
  }
  Write-Host "OK — generated files are up to date." -ForegroundColor Green
}

Write-Host ""
Write-Host "Done." -ForegroundColor Green
