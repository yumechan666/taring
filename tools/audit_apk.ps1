param([string]$Apk = 'build/app/outputs/flutter-apk/app-release.apk')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$apkPath = (Resolve-Path (Join-Path $root $Apk)).Path
$zip = [IO.Compression.ZipFile]::OpenRead($apkPath)
try {
    $checked = 0
    foreach ($folder in @('assets/images', 'assets/audio')) {
        foreach ($file in Get-ChildItem -LiteralPath (Join-Path $root $folder) -File -Recurse) {
            $relative = $file.FullName.Substring($root.Length + 1).Replace('\', '/')
            $encoded = ($relative.Split('/') | ForEach-Object { [Uri]::EscapeDataString($_) }) -join '/'
            $entry = $zip.GetEntry("assets/flutter_assets/$encoded")
            if ($null -eq $entry) { throw "Missing APK asset: $encoded" }
            $stream = $entry.Open()
            $sha = [Security.Cryptography.SHA256]::Create()
            try { $actual = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '') }
            finally { $stream.Dispose(); $sha.Dispose() }
            if ($actual -ne (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash) {
                throw "Stale APK asset: $encoded"
            }
            $checked++
        }
    }
    Write-Output "PASS: $checked bundled Flutter asset files match source."
} finally { $zip.Dispose() }
