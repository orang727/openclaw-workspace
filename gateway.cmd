@echo off
rem OpenClaw Gateway (v2026.3.13)
set "HOME=C:\Users\admin"
set "TMPDIR=C:\Users\admin\AppData\Local\Temp"
set "OPENCLAW_GATEWAY_PORT=18789"
set "OPENCLAW_SYSTEMD_UNIT=openclaw-gateway.service"
set "OPENCLAW_WINDOWS_TASK_NAME=OpenClaw Gateway"
set "OPENCLAW_SERVICE_MARKER=openclaw"
set "OPENCLAW_SERVICE_KIND=gateway"
set "OPENCLAW_SERVICE_VERSION=2026.3.13"
"C:\Program Files\nodejs\node.exe" C:\Users\admin\AppData\Roaming\npm\node_modules\openclaw\dist\index.js gateway --port 18789
