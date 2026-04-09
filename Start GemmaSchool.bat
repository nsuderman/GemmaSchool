@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

title GemmaSchool Launcher

cls
echo.
echo   +====================================+
echo   ^|      GemmaSchool                   ^|
echo   ^|      Sovereign Learning            ^|
echo   +====================================+
echo.

:: ── Check for Docker ─────────────────────────────────────────
echo [1/4] Checking Docker...
where docker >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo   Docker is not installed.
    echo   Installing via winget ^(Windows Package Manager^)...
    echo.
    winget install -e --id Docker.DockerDesktop --accept-package-agreements --accept-source-agreements
    if %errorlevel% neq 0 (
        echo.
        echo   Automatic install failed. Please install Docker Desktop manually:
        echo   https://www.docker.com/products/docker-desktop/
        echo.
        pause
        start https://www.docker.com/products/docker-desktop/
        exit /b 1
    )
    echo.
    echo   Docker Desktop installed.
    echo   Please launch Docker Desktop from the Start Menu, wait for it
    echo   to finish starting ^(whale icon in system tray^), then run this
    echo   file again.
    echo.
    pause
    exit /b 0
)
echo   Docker found.

:: ── Wait for Docker daemon ────────────────────────────────────
echo.
echo [2/4] Waiting for Docker to be ready...
echo   ^(If Docker Desktop is not open, please start it from the taskbar^)
echo.
:wait_docker
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo|set /p="."
    timeout /t 2 /nobreak >nul
    goto wait_docker
)
echo.
echo   Docker is ready.

:: ── Detect real host RAM ──────────────────────────────────────
echo.
echo [3/4] Detecting system hardware...
for /f "tokens=2 delims==" %%A in ('wmic computersystem get TotalPhysicalMemory /value 2^>nul ^| findstr "="') do set HOST_RAM_BYTES=%%A
if defined HOST_RAM_BYTES (
    set /a HOST_RAM_GB=!HOST_RAM_BYTES! / 1073741824
) else (
    set HOST_RAM_GB=0
)
for /f "tokens=2 delims==" %%A in ('wmic OS get FreePhysicalMemory /value 2^>nul ^| findstr "="') do set HOST_FREE_KB=%%A
if defined HOST_FREE_KB (
    set /a HOST_AVAILABLE_GB=!HOST_FREE_KB! / 1048576
) else (
    set HOST_AVAILABLE_GB=0
)
for /f "tokens=2 delims==" %%A in ('wmic cpu get NumberOfCores /value 2^>nul ^| findstr "="') do set HOST_CPU_CORES=%%A
if not defined HOST_CPU_CORES set HOST_CPU_CORES=0
echo   Detected: !HOST_RAM_GB! GB RAM ^(!HOST_AVAILABLE_GB! GB free^), !HOST_CPU_CORES! CPU cores

:: ── Start GemmaSchool ─────────────────────────────────────────
echo.
echo [4/5] Starting GemmaSchool...
docker compose up --build -d
if %errorlevel% neq 0 (
    echo.
    echo   Failed to start containers. Check that Docker Desktop is running.
    pause
    exit /b 1
)

:: ── Wait for frontend ─────────────────────────────────────────
echo.
echo [5/5] Waiting for the app to be ready...
:wait_frontend
curl -s -o nul -w "%%{http_code}" http://localhost:5173 2>nul | findstr /r "200 304" >nul
if %errorlevel% neq 0 (
    echo|set /p="."
    timeout /t 2 /nobreak >nul
    goto wait_frontend
)
echo.
echo   GemmaSchool is ready!

:: ── Open browser ─────────────────────────────────────────────
echo.
echo   Opening http://localhost:5173 in your browser...
start http://localhost:5173

echo.
echo   =========================================
echo   GemmaSchool is running.
echo   Visit http://localhost:5173 anytime.
echo.
echo   To stop: right-click Docker in the system
echo   tray and choose Quit, or run 'make stop'.
echo   =========================================
echo.
pause
