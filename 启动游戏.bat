@echo off
chcp 65001 >nul
rem ============================================================
rem  越野自行车 · 一键启动
rem  原因：游戏使用 ES Module，直接双击 index.html（file://）
rem  会被 Chrome/Edge 安全策略拦截导致按钮失灵。
rem  本脚本启动一个本地服务器后自动打开浏览器。
rem ============================================================
cd /d "%~dp0"

where bun >nul 2>nul
if %errorlevel%==0 (
  echo 使用本地服务器 http://localhost:8765 打开游戏...
  start "" http://localhost:8765
  bun run "%~dp0tools\_serve.mjs"
  goto :eof
)

where python >nul 2>nul
if %errorlevel%==0 (
  echo 使用本地服务器 http://localhost:8000 打开游戏...
  start "" http://localhost:8000
  python -m http.server 8000 --directory "%~dp0"
  goto :eof
)

echo 未找到 bun 或 python，无法启动本地服务器。
echo 请先安装 bun（https://bun.sh）或 python 后重试。
pause
