@echo off
title ESSENCE Dashboard Server

:: Dashboard HTML path — override with the DASHBOARD_HTML env var; defaults to the
:: copy that ships beside this script (avoids hardcoding a per-user Downloads path).
if "%DASHBOARD_HTML%"=="" set "DASHBOARD_HTML=%~dp0essence-token-dashboard.html"

:: Open the dashboard first
echo Opening dashboard...
start "" "%DASHBOARD_HTML%"

echo.
echo  ESSENCE Token Dashboard
echo  ========================
echo  Refresh button is now active.
echo  Close this window to stop the server.
echo.

:: Run update server in foreground (keeps window open)
py.exe "%~dp0update-server.py"
