@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul 2>&1

title Anime Manager
color 07

set "base=C:\Users\Pichau\Desktop\myhtml"
set "res=%temp%\anime_res.txt"
set "esc=0"

:MENU
cls
echo.
echo ANIME MANAGER
echo.
echo 1 - Mover Imagens
echo 2 - Deletar Imagens
echo 3 - Sair
echo.
call :ASK "Escolha uma opção:" op
if "%esc%"=="1" goto MENU

if "%op%"=="1" goto MOVER
if "%op%"=="2" goto DELETAR
if "%op%"=="3" goto SAIR

call :PAUSA "Opção inválida."
goto MENU

:MOVER
cls
echo.
echo 1 - Plan to Watch
echo 2 - Watching Now
echo 3 - MyRanks
echo.
set "origem="
set "destino="
set "anime="

call :ASK "Origem:" origem
if "%esc%"=="1" goto MENU
if "%origem%"=="1" goto MOVER_ORIGEM_OK
if "%origem%"=="2" goto MOVER_ORIGEM_OK
if "%origem%"=="3" goto MOVER_ORIGEM_OK
call :PAUSA "Origem inválida."
goto MENU

:MOVER_ORIGEM_OK
call :ASK "Destino:" destino
if "%esc%"=="1" goto MENU
if "%destino%"=="1" goto MOVER_DESTINO_OK
if "%destino%"=="2" goto MOVER_DESTINO_OK
if "%destino%"=="3" goto MOVER_DESTINO_OK
call :PAUSA "Destino inválido."
goto MENU

:MOVER_DESTINO_OK
if "%origem%"=="%destino%" (
    call :PAUSA "A origem e o destino não podem ser iguais."
    goto MENU
)

call :SET_GROUP "%origem%" origem
call :SET_GROUP "%destino%" destino

set "cand=%temp%\anime_cand.txt"
break > "%cand%"
for %%N in (1 2 3 4) do call :LIST_NAMES "!origem%%N!"

call :ASK "ID ou nome do anime:" anime "%cand%"
if "%esc%"=="1" goto MENU
if not defined anime (
    call :PAUSA "O nome do anime não pode ficar vazio."
    goto MENU
)

cls
echo.
echo Anime : !origemName!  -^>  !destinoName!
echo ID    : !anime!
echo.

set /a moved=0

for %%N in (1 2 3) do (
    set "src=!origem%%N!"
    set "dst=!destino%%N!"
    call :MOVE_MATCHING "!src!" "!dst!" "IMAGEM"
)

set "src=!origem4!"
set "dst=!destino4!"
call :MOVE_MATCHING "!src!" "!dst!" "BANNER"

if !moved! EQU 0 (
    echo Nenhum arquivo foi movido.
) else (
    echo.
    if !moved! EQU 1 (
        echo Total Movido: 1 arquivo.
    ) else (
        echo Total Movido: !moved! arquivos.
    )
)
call :PAUSA_MENU_L
goto MENU

:DELETAR
cls
echo.
echo 1 - Plan to Watch
echo 2 - Watching Now
echo 3 - MyRanks
echo.
set "grupo="
set "anime="

call :ASK "Grupo:" grupo
if "%esc%"=="1" goto MENU
if "%grupo%"=="1" goto DELETE_GROUP_OK
if "%grupo%"=="2" goto DELETE_GROUP_OK
if "%grupo%"=="3" goto DELETE_GROUP_OK
call :PAUSA "Grupo inválido."
goto MENU

:DELETE_GROUP_OK
call :ASK "ID ou nome do anime:" anime
if "%esc%"=="1" goto MENU
if not defined anime (
    call :PAUSA "O nome do anime não pode ficar vazio."
    goto MENU
)

call :SET_GROUP "%grupo%" apagar

cls
echo.
echo Grupo : !apagarName!
echo ID    : !anime!
echo.

set /a found=0

if "%grupo%"=="3" goto DELETE_MYRanks

for %%N in (1 2 3) do (
    set "p=!apagar%%N!"
    call :FIND_MATCHING "!p!"
)
goto DELETE_CHECK

:DELETE_MYRanks
for %%N in (1 2 3 4) do (
    set "p=!apagar%%N!"
    call :FIND_MATCHING "!p!"
)

:DELETE_CHECK
if !found! EQU 0 (
    echo Nenhum arquivo encontrado.
    call :PAUSA_MENU_L
    goto MENU
)

if !found! EQU 1 (
    echo Encontrado: 1 arquivo
) else (
    echo Encontrados: !found! arquivos
)
echo A exclusão será permanente.
echo.
set "confirm="
call :ASK "Confirmar exclusão? S/N:" confirm
if "%esc%"=="1" goto MENU
if /i not "%confirm%"=="S" (
    call :PAUSA "Exclusão cancelada."
    goto MENU
)

set /a deleted=0

echo.

if "%grupo%"=="3" goto DELETE_FOUR

for %%N in (1 2 3) do (
    set "p=!apagar%%N!"
    call :DELETE_MATCHING "!p!"
)
goto DELETE_END

:DELETE_FOUR
for %%N in (1 2 3 4) do (
    set "p=!apagar%%N!"
    call :DELETE_MATCHING "!p!"
)

:DELETE_END
if !deleted! EQU 0 (
    echo Nenhum arquivo foi deletado.
) else (
    echo.
    if !deleted! EQU 1 (
        echo Total deletado: 1 arquivo.
    ) else (
        echo Total deletado: !deleted! arquivos.
    )
)
call :PAUSA_MENU_L
goto MENU

:SAIR
cls
echo.
echo      Anime Manager encerrado.
echo.
endlocal
exit /b

:SET_GROUP
set "num=%~1"
set "prefix=%~2"

set "%prefix%1="
set "%prefix%2="
set "%prefix%3="
set "%prefix%4="
set "%prefix%Name="

if "%num%"=="1" (
    set "%prefix%Name=Plan to Watch"
    set "%prefix%1=%base%\plantowatch-images\plantowatch"
    set "%prefix%2=%base%\plantowatch-images\plantowatch-search"
    set "%prefix%3=%base%\plantowatch-images\plantowatch-sequels"
    set "%prefix%4=%base%\plantowatch-images\plantowatch-banner"
    exit /b
)

if "%num%"=="2" (
    set "%prefix%Name=Watching Now"
    set "%prefix%1=%base%\watchingnow-images\watchingnow"
    set "%prefix%2=%base%\watchingnow-images\watchingnow-search"
    set "%prefix%3=%base%\watchingnow-images\watchingnow-sequels"
    set "%prefix%4=%base%\watchingnow-images\watchingnow-banner"
    exit /b
)

if "%num%"=="3" (
    set "%prefix%Name=MyRanks"
    set "%prefix%1=%base%\myranks-images\myranks"
    set "%prefix%2=%base%\myranks-images\myranks-search"
    set "%prefix%3=%base%\myranks-images\myranks-sequels"
    set "%prefix%4=%base%\myranks-images\myranks-banner"
    exit /b
)
exit /b

:MOVE_MATCHING
set "src=%~1"
set "dst=%~2"
set "label=%~3"
if not exist "%src%\" exit /b
if not exist "%dst%\" mkdir "%dst%" >nul 2>&1

for /f "delims=" %%F in ('dir /b /a-d "%src%\*" 2^>nul') do (
    if /i "%%~nF"=="%anime%" (
        move /Y "%src%\%%F" "%dst%\%%F" >nul 2>&1
        if not errorlevel 1 (
            if /i "%label%"=="BANNER" (
                echo [OK] Banner movido: %%F
            ) else (
                echo [OK] Imagem movida: %%F
            )
            set /a moved+=1
        ) else (
            echo [X] Erro ao mover: %%F
        )
    )
)
exit /b

:FIND_MATCHING
set "p=%~1"
if not exist "%p%\" exit /b

for /f "delims=" %%F in ('dir /b /a-d "%p%\*" 2^>nul') do (
    if /i "%%~nF"=="%anime%" (
        set /a found+=1
    )
)
exit /b

:DELETE_MATCHING
set "p=%~1"
if not exist "%p%\" exit /b

for /f "delims=" %%F in ('dir /b /a-d "%p%\*" 2^>nul') do (
    if /i "%%~nF"=="%anime%" (
        del /Q "%p%\%%F" >nul 2>&1
        if not errorlevel 1 (
            echo [OK] Deletado: %%F
            set /a deleted+=1
        ) else (
            echo [X] Não foi possível deletar: %%F
        )
    )
)
exit /b

:PAUSA
set "msg=%~1"
echo.
echo [^^!] %msg%
pause >nul
exit /b

:LIST_NAMES
set "p=%~1"
if not exist "%p%\" exit /b
for /f "delims=" %%F in ('dir /b /a-d "%p%\*" 2^>nul') do >>"%cand%" echo %%~nF
exit /b

:PAUSA_MENU_L
echo Pressione qualquer tecla para voltar ao início...
pause >nul
exit /b

:ASK
set "esc=0"
set "%~2="
del "%res%" >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ghost.ps1" -Prompt "%~1" -Candidates "%~3" -Result "%res%"
if errorlevel 1 set "esc=1"
if "%esc%"=="0" if exist "%res%" set /p "%~2=" <"%res%"
exit /b