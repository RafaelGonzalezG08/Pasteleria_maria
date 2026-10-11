@echo off
rem Arranca el backend en modo desarrollo. Existe porque el lanzador de Claude
rem Code no siempre tiene npm en el PATH: aqui se busca Node en las rutas
rem habituales de Windows antes de rendirse.
setlocal
if exist "%ProgramFiles%\nodejs\npm.cmd" set "PATH=%ProgramFiles%\nodejs;%PATH%"
if exist "%LOCALAPPDATA%\Programs\nodejs\npm.cmd" set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"
cd /d "%~dp0\.."
call npm --prefix backend run start:dev
