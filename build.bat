@echo off
setlocal

:: ============================================================================
:: Clean Build Option: Run "build.bat clean" to wipe the project.
:: ============================================================================
if /i "%1"=="clean" (
    echo [Step 0] Cleaning project workspace...
    if exist "node_modules" rmdir /s /q "node_modules"
    if exist "dist" rmdir /s /q "dist"
    if exist ".venv" rmdir /s /q ".venv"
    if exist "node" rmdir /s /q "node"
    if exist "package-lock.json" del "package-lock.json"
    echo  - Clean complete.
    goto :Finish
)

:: ============================================================================
:: Main Execution
:: ============================================================================
call :main
goto :Finish

:main
    call :Step1_SetupNode
    if %errorlevel% neq 0 exit /B 1
    call :Step2_InstallDependencies
    if %errorlevel% neq 0 exit /B 1
    call :Step3_CompileTypeScript
    if %errorlevel% neq 0 exit /B 1
    call :Step4_RunServer
    exit /B 0

:Step1_SetupNode
    set "NODE_DIR=node"
    rem If the portable node directory exists, assume it's set up.
    if exist "%NODE_DIR%\" (
        set "PATH=%CD%\%NODE_DIR%;%PATH%"
        exit /B 0
    )
    echo.
    echo [Step 1] Setting up local, portable Node.js environment...
    echo  - This is a safe, sandboxed copy and will not affect your system.
    set "NODE_VERSION=20.12.2"
    set "NODE_ZIP=node-v%NODE_VERSION%-win-x64.zip"
    set "NODE_URL=https://nodejs.org/dist/v%NODE_VERSION%/%NODE_ZIP%"
    set "NODE_EXTRACTED_DIR=node-v%NODE_VERSION%-win-x64"
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri '%NODE_URL%' -OutFile '%NODE_ZIP%'"
    if %errorlevel% neq 0 (echo ERROR: Failed to download Node.js. & exit /B 1)
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path '%NODE_ZIP%' -DestinationPath '.' -Force"
    if %errorlevel% neq 0 (echo ERROR: Failed to unzip Node.js. & exit /B 1)
    ren "%NODE_EXTRACTED_DIR%" "%NODE_DIR%"
    del "%NODE_ZIP%"
    set "PATH=%CD%\%NODE_DIR%;%PATH%"
    echo  - Portable Node.js setup complete.
    exit /B 0

:Step2_InstallDependencies
    echo.
    echo [Step 2] Installing dependencies...
    cmd /c "npm install"
    if %errorlevel% neq 0 (echo ERROR: 'npm install' failed. & exit /B 1)
    exit /B 0

:Step3_CompileTypeScript
    echo.
    echo [Step 3] Compiling TypeScript project...
    cmd /c "npm run build"
    if %errorlevel% neq 0 (echo ERROR: TypeScript compilation failed. & exit /B 1)
    exit /B 0

:Step4_RunServer
    echo.
    echo [Step 4] Starting the web server...
    echo ============================================================================
    cmd /c "npm start"
    exit /B 0

:Finish
    echo.
    echo ============================================================================
    if %errorlevel% neq 0 (
        echo Script finished with an error.
    ) else (
        echo Server has been stopped.
    )
    echo Press any key to exit.
    pause >nul
    endlocal