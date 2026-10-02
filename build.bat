@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo  可选：打包成单文件（正常游玩不需要这一步）
echo ============================================
echo  项目本体是"零构建"的：index.html 直接用 ES module 加载 src/main.js，
echo  任何静态服务器（含 GitHub Pages）都能直接跑。
echo  本脚本只用于产出一个可双击离线游玩的单文件 dist\game.bundle.js。
echo.

set "BUN="
where bun >nul 2>nul && set "BUN=bun"
if not defined BUN (
  if exist "%USERPROFILE%\.cherrystudio\bin\bun.exe" set "BUN=%USERPROFILE%\.cherrystudio\bin\bun.exe"
)

if not defined BUN (
  echo [错误] 未找到 bun。
  echo   装一个即可：https://bun.sh  或  npm i -g bun
  echo   不想装 bun 也不影响游玩 —— 直接起个静态服务器就行：
  echo     node tools\_serve.mjs   然后打开 http://localhost:8765
  pause
  exit /b 1
)

"%BUN%" build src/main.js --outfile dist/game.bundle.js --target browser --format iife
if errorlevel 1 (
  echo [错误] 打包失败。
  pause
  exit /b 1
)
echo.
echo 打包完成：dist\game.bundle.js
echo ★ 这个文件必须跟着源码一起提交（.gitignore 特意没排除它）：
echo   index.html 的主入口就是它，src/main.js 只是兜底。
echo   不重新打包就提交，线上会脚本 404 —— 页面能看，但所有按钮点不动。
pause
