@echo off
rem Android APK uretir.
rem   apk_uret.bat         imzali APK     -> dist\SuAltiSavunma.apk
rem   apk_uret.bat debug   debug APK      -> dist\SuAltiSavunma-debug.apk
rem Android Studio (ya da Android SDK) ve JDK 17-23 gerekiyor.
rem Ilk calismada imza anahtari androidnahtar klasorune uretilir, o klasoru yedekleyin.
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul 2>&1
cd /d "%~dp0"
set "KOK=%CD%"
set "MOD=release"
if /i "%~1"=="debug" set "MOD=debug"

echo.
echo === Su Alti Savunma: Android APK ===

rem ---- 1) JDK bul (17-23 arasi; Gradle 8 daha yenisini desteklemez)
set "JDK="
for %%C in ("%ProgramFiles%\Android\Android Studio\jbr" "%ProgramFiles%\Android\Android Studio Preview\jbr" "%LOCALAPPDATA%\Programs\Android Studio\jbr" "%JAVA_HOME%") do (
    if not defined JDK if exist "%%~C\bin\java.exe" (
        call :surum_kontrol "%%~C"
        if "!SURUM_OK!"=="1" set "JDK=%%~C"
    )
)
if not defined JDK (
    for /f "delims=" %%J in ('where java 2^>nul') do (
        if not defined JDK (
            set "ADAY=%%~dpJ.."
            for %%K in ("!ADAY!") do set "ADAY=%%~fK"
            call :surum_kontrol "!ADAY!"
            if "!SURUM_OK!"=="1" set "JDK=!ADAY!"
        )
    )
)
if not defined JDK (
    echo [HATA] Uygun JDK bulunamadi. Android Studio kurun ^(icinde JDK 21 gelir^) ya da JDK 17-23 kurup JAVA_HOME ayarlayin.
    goto :bitir_hata
)
echo JDK: %JDK%
set "JAVA_HOME=%JDK%"

rem ---- 2) Android SDK bul
set "SDK="
if defined ANDROID_HOME if exist "%ANDROID_HOME%\platforms" set "SDK=%ANDROID_HOME%"
if not defined SDK if defined ANDROID_SDK_ROOT if exist "%ANDROID_SDK_ROOT%\platforms" set "SDK=%ANDROID_SDK_ROOT%"
if not defined SDK if exist "%LOCALAPPDATA%\Android\Sdk\platforms" set "SDK=%LOCALAPPDATA%\Android\Sdk"
if not defined SDK (
    echo [HATA] Android SDK bulunamadi. Android Studio'yu kurup bir kez acin ^(SDK otomatik inir^) ya da ANDROID_HOME ayarlayin.
    goto :bitir_hata
)
echo Android SDK: %SDK%
set "ANDROID_HOME=%SDK%"
set "SDK_YOL=%SDK:\=/%"
> "%KOK%\android\local.properties" echo sdk.dir=%SDK_YOL%

rem ---- 3) Imza anahtari (yalnizca surum APK'si icin)
if /i "%MOD%"=="release" (
    if not exist "%KOK%\android\anahtar\anahtar.properties" (
        echo Imza anahtari yok, ilk kez uretiliyor...
        if not exist "%KOK%\android\anahtar" mkdir "%KOK%\android\anahtar"
        set "PAROLA=sas!RANDOM!!RANDOM!!RANDOM!x"
        "%JDK%\bin\keytool.exe" -genkeypair -keystore "%KOK%\android\anahtar\anahtar.jks" -storetype JKS -alias savunma -keyalg RSA -keysize 2048 -validity 36500 -storepass !PAROLA! -keypass !PAROLA! -dname "CN=Su Alti Savunma, O=CaptainGM, C=TR" >nul 2>&1
        if errorlevel 1 (
            echo [HATA] Imza anahtari uretilemedi.
            goto :bitir_hata
        )
        > "%KOK%\android\anahtar\anahtar.properties" (
            echo storeFile=anahtar.jks
            echo storePassword=!PAROLA!
            echo keyAlias=savunma
        )
        echo.
        echo   ONEMLI: android\anahtar\ klasorunu yedekleyin. Bu anahtar kaybolursa APK'nin yeni surumleri
        echo   eskisinin ustune kurulamaz ^(telefondaki oyunu silip yeniden kurmak gerekir^).
        echo.
    )
)

rem ---- 4) Derle
cd /d "%KOK%\android"
if /i "%MOD%"=="release" (set "GOREV=assembleRelease") else (set "GOREV=assembleDebug")
echo Derleniyor ^(%GOREV%^)... ilk calismada Gradle indirilebilir, birkac dakika surebilir.
call "%KOK%\android\gradlew.bat" %GOREV% --no-daemon --console=plain -q
if errorlevel 1 (
    echo.
    echo [HATA] Derleme basarisiz. Yukaridaki ciktiya bakin.
    goto :bitir_hata
)

rem ---- 5) APK'yi dist klasorune kopyala
if not exist "%KOK%\dist" mkdir "%KOK%\dist"
if /i "%MOD%"=="release" (
    set "KAYNAK=%KOK%\android\app\build\outputs\apk\release\app-release.apk"
    set "HEDEF=%KOK%\dist\SuAltiSavunma.apk"
) else (
    set "KAYNAK=%KOK%\android\app\build\outputs\apk\debug\app-debug.apk"
    set "HEDEF=%KOK%\dist\SuAltiSavunma-debug.apk"
)
if not exist "!KAYNAK!" (
    echo [HATA] APK olusmadi: !KAYNAK!
    goto :bitir_hata
)
copy /y "!KAYNAK!" "!HEDEF!" >nul
for %%F in ("!HEDEF!") do set "BOYUT=%%~zF"
set /a MB=!BOYUT!/1048576
echo.
echo TAMAM: !HEDEF!  ^(~!MB! MB^)
echo Telefona kurmak icin: dosyayi telefona gonderin ^(kablo, WhatsApp, e-posta...^) ve acin;
echo "bilinmeyen kaynaklardan yukleme" izni isteyebilir. Ya da USB ile:  adb install -r "!HEDEF!"
echo %CMDCMDLINE% | find /i "/c" >nul && pause
endlocal
exit /b 0

:surum_kontrol
rem  %1 = JDK klasoru. SURUM_OK=1 ise ana surum 17..23
set "SURUM_OK=0"
set "SV="
"%~1\bin\java.exe" -version 2> "%TEMP%\sas_jv.txt" >nul
for /f "usebackq tokens=3" %%V in (`findstr /i "version" "%TEMP%\sas_jv.txt"`) do if not defined SV set "SV=%%~V"
del "%TEMP%\sas_jv.txt" >nul 2>&1
if not defined SV exit /b 0
for /f "tokens=1 delims=." %%M in ("!SV!") do set "ANA=%%M"
if "!ANA!"=="1" exit /b 0
set /a ANA_N=!ANA! 2>nul
if !ANA_N! GEQ 17 if !ANA_N! LEQ 23 set "SURUM_OK=1"
exit /b 0

:bitir_hata
echo.
echo %CMDCMDLINE% | find /i "/c" >nul && pause
endlocal
exit /b 1
