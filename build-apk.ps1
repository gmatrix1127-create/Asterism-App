# 一键打包：把 www 里的网页同步进安卓工程，编译出正式版 APK（用 D:\Android\keys 里的固定签名）
# 用法：在本目录运行  powershell -ExecutionPolicy Bypass -File .\build-apk.ps1
$ErrorActionPreference = 'Stop'

# 只对本次运行生效，不改系统环境变量
$env:JAVA_HOME        = 'D:\Android\jdk-21'
$env:ANDROID_HOME     = 'D:\Android\sdk'
$env:GRADLE_USER_HOME = 'D:\Android\gradle-home'   # Gradle 缓存放 D 盘，不占 C 盘
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"

Set-Location $PSScriptRoot
npx cap sync android
if ($LASTEXITCODE -ne 0) { throw 'cap sync 失败' }

Push-Location android
.\gradlew.bat assembleRelease --console=plain --no-daemon
$code = $LASTEXITCODE
Pop-Location
if ($code -ne 0) { throw 'Gradle 编译失败' }

$ver = (Select-String -Path 'android\app\build.gradle' -Pattern 'versionName "([^"]+)"').Matches[0].Groups[1].Value
$out = "$PSScriptRoot\Asterism-$ver.apk"
Copy-Item 'android\app\build\outputs\apk\release\app-release.apk' $out -Force
Write-Host "完成：$out" -ForegroundColor Green
