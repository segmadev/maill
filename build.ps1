# =============================================================================
# build.ps1 — run on Windows to build the React frontend and package
#             two separate ZIPs: one per server.
#
# Architecture:
#   Backend server  → hosts Laravel API  → upload-backend.zip
#   Frontend server → hosts React app    → upload-frontend.zip
#   Both servers pull from the same git repo.
#
# Usage (from C:\dev\mail):
#   .\build.ps1
#
# Output:
#   upload-backend.zip   → upload to backend server, then run:
#                          bash backend-fresh/deploy.sh
#
#   upload-frontend.zip  → upload to frontend server, then run:
#                          bash admin/deploy.sh
#
# Files excluded from backend zip (server keeps its own):
#   vendor/            → composer install runs on the server
#   node_modules/
#   .env               → server has its own secrets
#   storage/           → user uploads and logs live here
#   bootstrap/cache/
#   database/*.sqlite  → the LIVE database stays on the server
#
# NOTE: The database/ FOLDER itself IS included (it contains migration PHP
#       files). Only the .sqlite DATA FILE is excluded.
# =============================================================================

$ErrorActionPreference = "Stop"

$Root        = $PSScriptRoot
$BackendSrc  = Join-Path $Root "backend-fresh"
$FrontendSrc = Join-Path $Root "admin"
$TmpDir      = Join-Path $Root "_build_tmp"
$BackendZip  = Join-Path $Root "upload-backend.zip"
$FrontendZip = Join-Path $Root "upload-frontend.zip"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Mail Manager — Build & Package" -ForegroundColor Cyan
Write-Host "  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Gray
Write-Host "  Backend + Frontend (separate servers)" -ForegroundColor Gray
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Clean tmp
if (Test-Path $TmpDir) { Remove-Item $TmpDir -Recurse -Force }
New-Item -ItemType Directory -Path $TmpDir | Out-Null

# =============================================================================
# PACKAGE 1 — Backend (Laravel API server)
# =============================================================================
Write-Host "--- Backend package ---" -ForegroundColor Yellow
Write-Host ""

$BackendOut = Join-Path $TmpDir "backend"
New-Item -ItemType Directory -Path $BackendOut | Out-Null

Write-Host "▶  Copying backend source (excluding vendor / .env / storage / sqlite)..." -ForegroundColor Yellow

# Directories and files to exclude
$excludeDirs  = @("vendor", "node_modules", "storage", "bootstrap\cache", "_build_tmp")
$excludeFiles = @(".env", ".env.local", "database.sqlite", "database.sqlite-shm", "database.sqlite-wal")

$robocopyArgs = @(
    $BackendSrc,
    $BackendOut,
    "/E",
    "/NFL", "/NDL", "/NJH", "/NJS",
    "/XD"
) + $excludeDirs + @("/XF") + $excludeFiles

& robocopy @robocopyArgs | Out-Null
Write-Host "   Done." -ForegroundColor Green

Write-Host "▶  Creating upload-backend.zip..." -ForegroundColor Yellow
if (Test-Path $BackendZip) { Remove-Item $BackendZip -Force }
Compress-Archive -Path (Join-Path $BackendOut "*") -DestinationPath $BackendZip
$sz = [math]::Round((Get-Item $BackendZip).Length / 1MB, 1)
Write-Host "   Done. ($sz MB)" -ForegroundColor Green
Write-Host ""

# =============================================================================
# PACKAGE 2 — Frontend (React server)
# =============================================================================
Write-Host "--- Frontend package ---" -ForegroundColor Yellow
Write-Host ""

Write-Host "▶  Building React app..." -ForegroundColor Yellow
Set-Location $FrontendSrc
npm run build
Write-Host "   Done." -ForegroundColor Green
Write-Host ""

$FrontendOut = Join-Path $TmpDir "frontend"
New-Item -ItemType Directory -Path $FrontendOut | Out-Null

Write-Host "▶  Copying frontend source + built dist..." -ForegroundColor Yellow

# Copy everything except node_modules and dist (dist gets copied separately below)
$feExcludeDirs = @("node_modules", "dist", "_build_tmp")
$feRobocopyArgs = @(
    $FrontendSrc,
    $FrontendOut,
    "/E",
    "/NFL", "/NDL", "/NJH", "/NJS",
    "/XD"
) + $feExcludeDirs

& robocopy @feRobocopyArgs | Out-Null

# Copy built dist
Copy-Item (Join-Path $FrontendSrc "dist") (Join-Path $FrontendOut "dist") -Recurse
Write-Host "   Done." -ForegroundColor Green

Write-Host "▶  Creating upload-frontend.zip..." -ForegroundColor Yellow
if (Test-Path $FrontendZip) { Remove-Item $FrontendZip -Force }
Compress-Archive -Path (Join-Path $FrontendOut "*") -DestinationPath $FrontendZip
$sz2 = [math]::Round((Get-Item $FrontendZip).Length / 1MB, 1)
Write-Host "   Done. ($sz2 MB)" -ForegroundColor Green
Write-Host ""

# Clean tmp
Remove-Item $TmpDir -Recurse -Force

# =============================================================================
# Summary
# =============================================================================
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Packages ready!" -ForegroundColor Green
Write-Host ""
Write-Host "  upload-backend.zip  ($sz MB)" -ForegroundColor White
Write-Host "  → Upload to BACKEND server, then:" -ForegroundColor Gray
Write-Host "      unzip -o upload-backend.zip -d /var/www/mail/backend-fresh" -ForegroundColor DarkGray
Write-Host "      bash /var/www/mail/backend-fresh/deploy.sh" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  upload-frontend.zip  ($sz2 MB)" -ForegroundColor White
Write-Host "  → Upload to FRONTEND server, then:" -ForegroundColor Gray
Write-Host "      unzip -o upload-frontend.zip -d /var/www/mail/admin" -ForegroundColor DarkGray
Write-Host "      bash /var/www/mail/admin/deploy.sh" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  OR (if both servers have git):" -ForegroundColor White
Write-Host "    Backend  server: bash /var/www/mail/backend-fresh/deploy.sh" -ForegroundColor DarkGray
Write-Host "    Frontend server: bash /var/www/mail/admin/deploy.sh" -ForegroundColor DarkGray
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

Set-Location $Root
