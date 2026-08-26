@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

set "base=C:\Users\Pichau\Desktop\myhtml"

:inicio
cls

echo.
echo === MOVER ANIME ===
echo.
echo 1 - Plan to Watch
echo 2 - Watching Now
echo 3 - MyRanks
echo.

set /p "origem=De qual grupo deseja mover? "
set /p "destino=Para qual grupo deseja mover? "
set /p "anime=Digite o ID/nome do anime: "

if not "%origem%"=="1" if not "%origem%"=="2" if not "%origem%"=="3" (
    echo.
    echo Origem invalida.
    pause
    exit /b
)

if not "%destino%"=="1" if not "%destino%"=="2" if not "%destino%"=="3" (
    echo.
    echo Destino invalido.
    pause
    exit /b
)

if "%origem%"=="%destino%" (
    echo.
    echo A origem e o destino nao podem ser iguais.
    pause
    exit /b
)

rem ============================================================
rem DEFINIR NOMES DOS GRUPOS
rem ============================================================

if "%origem%"=="1" set "origemNome=Plan to Watch"
if "%origem%"=="2" set "origemNome=Watching Now"
if "%origem%"=="3" set "origemNome=MyRanks"

if "%destino%"=="1" set "destinoNome=Plan to Watch"
if "%destino%"=="2" set "destinoNome=Watching Now"
if "%destino%"=="3" set "destinoNome=MyRanks"

echo.
echo Movendo "%anime%" de %origemNome% para %destinoNome%...
echo.

rem ============================================================
rem DEFINIR PASTAS DE ORIGEM
rem ============================================================

if "%origem%"=="1" (
    set "origem1=%base%\plantowatch-images\plantowatch"
    set "origem2=%base%\plantowatch-images\plantowatch-search"
    set "origem3=%base%\plantowatch-images\plantowatch-sequels"
)

if "%origem%"=="2" (
    set "origem1=%base%\watchingnow-images\watchingnow"
    set "origem2=%base%\watchingnow-images\watchingnow-search"
    set "origem3=%base%\watchingnow-images\watchingnow-sequels"
)

if "%origem%"=="3" (
    set "origem1=%base%\myranks-images\myranks"
    set "origem2=%base%\myranks-images\myranks-search"
    set "origem3=%base%\myranks-images\myranks-sequels"
)

rem ============================================================
rem DEFINIR PASTAS DE DESTINO
rem ============================================================

if "%destino%"=="1" (
    set "destino1=%base%\plantowatch-images\plantowatch"
    set "destino2=%base%\plantowatch-images\plantowatch-search"
    set "destino3=%base%\plantowatch-images\plantowatch-sequels"
)

if "%destino%"=="2" (
    set "destino1=%base%\watchingnow-images\watchingnow"
    set "destino2=%base%\watchingnow-images\watchingnow-search"
    set "destino3=%base%\watchingnow-images\watchingnow-sequels"
)

if "%destino%"=="3" (
    set "destino1=%base%\myranks-images\myranks"
    set "destino2=%base%\myranks-images\myranks-search"
    set "destino3=%base%\myranks-images\myranks-sequels"
)

rem ============================================================
rem MOVER NAS 3 PASTAS
rem ============================================================

for %%N in (1 2 3) do (

    set "pastaOrigem=!origem%%N!"
    set "pastaDestino=!destino%%N!"

    if not exist "!pastaOrigem!" (
        echo - Pasta de origem nao encontrada:
        echo   !pastaOrigem!
    ) else (

        if not exist "!pastaDestino!" (
            mkdir "!pastaDestino!" >nul 2>&1
        )

        set "encontrou=0"

        for /f "delims=" %%F in ('dir /b /a-d "!pastaOrigem!\*" 2^>nul') do (
            
            set "nomeArquivo=%%~nF"

            if /i "!nomeArquivo!"=="%anime%" (

                move /Y "!pastaOrigem!\%%F" "!pastaDestino!\" >nul

                if not errorlevel 1 (
                    echo ✓ Movido: %%F
                    set "encontrou=1"
                )
            )
        )

        if "!encontrou!"=="0" (
            echo - Nao encontrado: !pastaOrigem!
        )
    )
)

echo.
echo Concluido!
echo.
pause
exit /b