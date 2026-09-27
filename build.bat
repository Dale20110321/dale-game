@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo  重新打包游戏为单文件（改源码后运行一次）
echo ============================================
if exist "C:\Users\Dale\.cherrystudio\bin\bun.exe" (
  "C:\Users\Dale\.cherrystudio\bin\bun.exe" build src/main.js --outfile dist/game.bundle.js --target browser --format iife
) else (
  where bun >nul 2>nul
  if %errorlevel%==0 (
    bun build src/main.js --outfile dist/game.bundle.js --target browser --format iife
  ) else (
    echo [错误] 未找到 bun，请先安装 bun 或直接双击 index.html 运行现有的打包版。
    pause
    exit /b 1
  )
)
echo.
echo 打包完成：dist\game.bundle.js
echo 现在双击 index.html 即可游玩（无需服务器）。
pause