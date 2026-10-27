@echo off
chcp 65001 >nul
title GitLib
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto nonode

node --disable-warning=ExperimentalWarning launch.mjs %*
if errorlevel 1 pause
exit /b

:nonode
echo Не найден Node.js.
echo Установите Node.js 22 LTS, версия 22.13 или новее: https://nodejs.org
echo После установки запустите GitLib.cmd ещё раз.
start "" https://nodejs.org
pause
exit /b 1
