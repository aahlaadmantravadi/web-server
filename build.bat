@echo off
setlocal enabledelayedexpansion
title Building and Running Node.js Web Server

:: ============================================================================
:: Main Execution Block
:: ============================================================================
call :main
goto :Finish


:main
    call :Step1_VerifyPrerequisites
    if %errorlevel% neq 0 exit /B 1

    call :Step2_SetupVenv
    if %errorlevel% neq 0 exit /B 1

    call :Step3_SetupNode
    if %errorlevel% neq 0 exit /B 1
    
    call :Step4_ConfigurePath
    if %errorlevel% neq 0 exit /B 1

    call :Step5_InstallDependencies
    if %errorlevel% neq 0 exit /B 1

    call :Step6_RunServer
    exit /B 0


:: ============================================================================
:: Subroutines
:: ============================================================================

:Step1_VerifyPrerequisites
    echo.
    echo [Step 1] Verifying prerequisites...
    where python >nul 2>nul
    if %errorlevel% neq 0 (
        echo ERROR: Python is not installed or not found in your PATH.
        exit /B 1
    )
    echo  - Python found.
    exit /B 0

:Step2_SetupVenv
    set "VENV_DIR=.venv"
    echo.
    echo [Step 2] Setting up Python virtual environment...
    if not exist "%VENV_DIR%\" (
        echo  - Creating virtual environment in "%VENV_DIR%"...
        cmd /c "python -m venv ""%VENV_DIR%"""
        if %errorlevel% neq 0 (
            echo ERROR: Failed to create Python virtual environment.
            exit /B 1
        )
    ) else (
        echo  - Virtual environment already exists.
    )
    echo  - Activating virtual environment.
    call "%VENV_DIR%\Scripts\activate.bat"
    exit /B 0

:Step3_SetupNode
    set "NODE_VERSION=20.12.2"
    set "NODE_DIR=node"
    set "NODE_ZIP=node-v%NODE_VERSION%-win-x64.zip"
    set "NODE_URL=https://nodejs.org/dist/v%NODE_VERSION%/%NODE_ZIP%"
    set "NODE_EXTRACTED_DIR=node-v%NODE_VERSION%-win-x64"
    
    echo.
    echo [Step 3] Checking for local Node.js installation...
    if exist "%NODE_DIR%\" (
        echo  - Local Node.js installation found.
        exit /B 0
    )

    echo  - Node.js not found locally. Starting download and setup...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -Uri '%NODE_URL%' -OutFile '%NODE_ZIP%' } catch { exit 1 }"
    if %errorlevel% neq 0 (
        echo ERROR: Failed to download Node.js.
        if exist "%NODE_ZIP%" del "%NODE_ZIP%"
        exit /B 1
    )

    echo  - Unzipping Node.js...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path '%NODE_ZIP%' -DestinationPath '.' -Force"
    if %errorlevel% neq 0 (
        echo ERROR: Failed to unzip Node.js using PowerShell.
        if exist "%NODE_ZIP%" del "%NODE_ZIP%"
        exit /B 1
    )

    if not exist "%NODE_EXTRACTED_DIR%\" (
        echo ERROR: Unzipped folder not found.
        if exist "%NODE_ZIP%" del "%NODE_ZIP%"
        exit /B 1
    )
    
    ren "%NODE_EXTRACTED_DIR%" "%NODE_DIR%"
    del "%NODE_ZIP%"
    echo  - Portable Node.js setup complete.
    exit /B 0

:Step4_ConfigurePath
    set "NODE_DIR=node"
    echo.
    echo [Step 4] Configuring environment path for this session...
    set "PATH=%CD%\%NODE_DIR%;%PATH%"
    echo  - Path set to include local Node.js.
    where node >nul 2>nul
    if %errorlevel% neq 0 (
        echo ERROR: node.exe not found in the path after setup.
        exit /B 1
    )
    cmd /c "node -v"
    cmd /c "npm -v"
    exit /B 0

:Step5_InstallDependencies
    echo.
    echo [Step 5] Installing Node.js dependencies...
    if not exist "node_modules\" (
        cmd /c "npm install"
        if %errorlevel% neq 0 (
            echo ERROR: 'npm install' failed.
            exit /B 1
        )
    ) else (
        echo  - 'node_modules' directory already exists. Skipping 'npm install'.
    )
    echo  - Dependencies are installed.
    exit /B 0

:Step6_RunServer
    echo.
    echo [Step 6] Starting the web server...
    echo ============================================================================
    echo.
    cmd /c "npm start"
    exit /B 0

:: ============================================================================
:: End of Script
:: ============================================================================
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
    exit /B %errorlevel%