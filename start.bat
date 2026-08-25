@echo off
title Su Alti Savunma - Tower Defense FX
echo ========================================
echo   SU ALTI SAVUNMA - Tower Defense FX
echo ========================================
echo.
echo Oyun baslatiliyor...
echo.

cd /d "%~dp0"

:: Maven ile JavaFX uygulamasini calistir
mvn javafx:run -q

if %ERRORLEVEL% neq 0 (
    echo.
    echo [HATA] Oyun baslatilirken bir sorun olustu!
    echo Maven veya Java kurulumunuzu kontrol edin.
    echo.
    pause
)