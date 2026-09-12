@echo off
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion

set "base=C:\Users\Pichau\Desktop\myhtml"

:inicio
cls
echo.
echo === GERENCIAR ANIME ===
echo.
echo 1 - Mover imagem
echo 2 - Deletar imagem
echo 3 - Sair
echo.
set /p "acao=Escolha uma opcao: "

if "%acao%"=="1" goto mover
if "%acao%"=="2" goto deletar
if "%acao%"=="3" goto fim

echo.
echo Opcao invalida.
pause
goto inicio


:mover
cls
echo.
echo === MOVER ANIME ===
echo.
echo 1 - Plan to Watch
echo 2 - Watching Now
echo 3 - MyRanks
echo.

set "origem="
set "destino="
set "anime="

set /p "origem=De qual grupo deseja mover? "
if not "%origem%"=="1" if not "%origem%"=="2" if not "%origem%"=="3" goto origem_invalida

set /p "destino=Para qual grupo deseja mover? "
if not "%destino%"=="1" if not "%destino%"=="2" if not "%destino%"=="3" goto destino_invalido

if "%origem%"=="%destino%" goto grupos_iguais

set /p "anime=Digite o ID/nome do anime: "
if not defined anime goto anime_invalido

goto executar_movimento


:origem_invalida
echo.
echo Origem invalida.
pause
goto inicio

:destino_invalido
echo.
echo Destino invalido.
pause
goto inicio

:grupos_iguais
echo.
echo A origem e o destino nao podem ser iguais.
pause
goto inicio

:anime_invalido
echo.
echo O nome do anime nao pode ficar vazio.
pause
goto inicio


:executar_movimento
call :definir_grupo "%origem%" origem
call :definir_grupo "%destino%" destino

echo.
echo Movendo "%anime%" de !origemNome! para !destinoNome!...
echo.

set "totalMovidos=0"

for %%N in (1 2 3) do (
    call set "pastaOrigem=%%origem%%N%%"
    call set "pastaDestino=%%destino%%N%%"

    if not exist "!pastaOrigem!\" (
        echo Pasta de origem nao encontrada: !pastaOrigem!
    ) else (
        if not exist "!pastaDestino!\" mkdir "!pastaDestino!" >nul 2>&1

        set "encontrouNestaPasta=0"

        for /f "delims=" %%F in ('dir /b /a-d "!pastaOrigem!\*" 2^>nul') do (
            if /i "%%~nF"=="%anime%" (
                move /Y "!pastaOrigem!\%%F" "!pastaDestino!\%%F" >nul
                if not errorlevel 1 (
                    echo Movido: %%F
                    set /a totalMovidos+=1
                    set "encontrouNestaPasta=1"
                ) else (
                    echo ERRO ao mover: %%F
                )
            )
        )

        if "!encontrouNestaPasta!"=="0" (
            echo Nao encontrado em: !pastaOrigem!
        )
    )
)

echo.
if "!totalMovidos!"=="0" (
    echo Nenhuma imagem foi movida.
) else (
    echo !totalMovidos! arquivo(s) movido(s) com sucesso.
)
echo.
pause
goto inicio


:deletar
cls
echo.
echo === DELETAR IMAGEM ===
echo.
echo 1 - Plan to Watch
echo 2 - Watching Now
echo 3 - MyRanks
echo.

set "grupo="
set "anime="
set /p "grupo=De qual grupo deseja deletar? "
if not "%grupo%"=="1" if not "%grupo%"=="2" if not "%grupo%"=="3" goto grupo_invalido

set /p "anime=Digite o ID/nome do anime: "
if not defined anime goto anime_invalido

call :definir_grupo "%grupo%" apagar

rem Primeiro verifica se o ID existe antes de pedir confirmacao.
set "totalEncontrados=0"

for %%N in (1 2 3) do (
    call set "pasta=%%apagar%%N%%"

    if exist "!pasta!\" (
        for /f "delims=" %%F in ('dir /b /a-d "!pasta!\*" 2^>nul') do (
            if /i "%%~nF"=="%anime%" (
                set /a totalEncontrados+=1
            )
        )
    )
)

if "!totalEncontrados!"=="0" (
    echo.
    echo Nenhuma imagem encontrada com o ID "%anime%" em !apagarNome!.
    echo Verifique se o nome foi digitado corretamente.
    echo.
    pause
    goto inicio
)

echo.
echo Encontrado(s): !totalEncontrados! arquivo(s).
echo ATENCAO: isso vai apagar "%anime%" das pastas de !apagarNome!.
set "confirmar="
set /p "confirmar=Tem certeza? (S/N): "

if /i not "%confirmar%"=="S" (
    echo.
    echo Exclusao cancelada.
    pause
    goto inicio
)

set "totalApagados=0"

for %%N in (1 2 3) do (
    call set "pasta=%%apagar%%N%%"

    if exist "!pasta!\" (
        for /f "delims=" %%F in ('dir /b /a-d "!pasta!\*" 2^>nul') do (
            if /i "%%~nF"=="%anime%" (
                del /Q "!pasta!\%%F"
                if not errorlevel 1 (
                    echo Deletado: %%F
                    set /a totalApagados+=1
                )
            )
        )
    )
)

echo.
if "!totalApagados!"=="0" (
    echo Nenhuma imagem foi deletada.
) else (
    echo !totalApagados! arquivo(s) deletado(s) com sucesso.
)
echo.
pause
goto inicio


:grupo_invalido
echo.
echo Grupo invalido.
pause
goto inicio


:definir_grupo
set "numero=%~1"
set "prefixo=%~2"

if "%numero%"=="1" (
    set "%prefixo%Nome=Plan to Watch"
    set "%prefixo%1=%base%\plantowatch-images\plantowatch"
    set "%prefixo%2=%base%\plantowatch-images\plantowatch-search"
    set "%prefixo%3=%base%\plantowatch-images\plantowatch-sequels"
    goto :eof
)

if "%numero%"=="2" (
    set "%prefixo%Nome=Watching Now"
    set "%prefixo%1=%base%\watchingnow-images\watchingnow"
    set "%prefixo%2=%base%\watchingnow-images\watchingnow-search"
    set "%prefixo%3=%base%\watchingnow-images\watchingnow-sequels"
    goto :eof
)

if "%numero%"=="3" (
    set "%prefixo%Nome=MyRanks"
    set "%prefixo%1=%base%\myranks-images\myranks"
    set "%prefixo%2=%base%\myranks-images\myranks-search"
    set "%prefixo%3=%base%\myranks-images\myranks-sequels"
    goto :eof
)

goto :eof


:fim
endlocal
exit /b
