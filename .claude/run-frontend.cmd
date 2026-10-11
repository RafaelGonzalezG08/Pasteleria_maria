@echo off
rem Arranca el frontend (Vite) en modo desarrollo. Ver run-backend.cmd para el
rem motivo del bloque que busca Node.
setlocal
if exist "%ProgramFiles%\nodejs\npm.cmd" set "PATH=%ProgramFiles%\nodejs;%PATH%"
if exist "%LOCALAPPDATA%\Programs\nodejs\npm.cmd" set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"
cd /d "%~dp0\.."
call npm --prefix frontend run dev -- --host --port 5173
