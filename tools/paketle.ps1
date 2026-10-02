# Windows icin kurulum gerektirmeyen uygulama klasoru ve zip uretir:  powershell -File tools\paketle.ps1
# Gerekenler: JDK 25+ (jpackage dahil) ve Maven.
# Cikti: dist\SuAltiSavunma\SuAltiSavunma.exe ve dist\SuAltiSavunma-windows.zip
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

$version = ([xml](Get-Content pom.xml)).project.version
Write-Host "Derleniyor (surum $version)..."
mvn -B -q clean package dependency:copy-dependencies "-DoutputDirectory=target/libs" "-DincludeScope=runtime"
if ($LASTEXITCODE -ne 0) { throw 'Maven derlemesi basarisiz' }
Copy-Item "target/TowerDefenseFX-$version.jar" target/libs/

# jpackage PATH'te olmayabilir: calisan java'nin JDK klasorunden bul
$jpackage = (Get-Command jpackage -ErrorAction SilentlyContinue)
if ($jpackage) { $jpackage = $jpackage.Source } else {
    $eap = $ErrorActionPreference; $ErrorActionPreference = 'Continue'    # java ayarlari stderr'e yazar
    $props = & java -XshowSettings:properties -version 2>&1 | Out-String
    $ErrorActionPreference = $eap
    $javaHome = (($props -split "`n" | Where-Object { $_ -match 'java\.home' } | Select-Object -First 1) -split '=')[1].Trim()
    $jpackage = Join-Path $javaHome 'bin\jpackage.exe'
}
if (-not (Test-Path $jpackage)) { throw "jpackage bulunamadi: $jpackage (JDK gerekli, JRE yetmez)" }

if (Test-Path dist) { Remove-Item dist -Recurse -Force }
Write-Host 'Uygulama klasoru hazirlaniyor (jpackage)...'
& $jpackage --type app-image --name SuAltiSavunma --app-version $version `
    --input target/libs --main-jar "TowerDefenseFX-$version.jar" --main-class com.kule.savunma.Launcher `
    --icon src/main/resources/web/assets/icon.ico `
    --java-options '--enable-native-access=ALL-UNNAMED' `
    --dest dist
if ($LASTEXITCODE -ne 0) { throw 'jpackage basarisiz' }

# virus tarayicisi dosyalari kisa sure kilitleyebilir: birkac kez dene
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = Join-Path (Get-Location) 'dist\SuAltiSavunma-windows.zip'
for ($i = 1; $i -le 6; $i++) {
    try {
        if (Test-Path $zip) { Remove-Item $zip -Force }
        [IO.Compression.ZipFile]::CreateFromDirectory((Join-Path (Get-Location) 'dist\SuAltiSavunma'), $zip, 'Optimal', $true)
        break
    } catch {
        if ($i -eq 6) { throw }
        Start-Sleep -Seconds 3
    }
}
Write-Host 'Hazir: dist\SuAltiSavunma\SuAltiSavunma.exe ve dist\SuAltiSavunma-windows.zip'
