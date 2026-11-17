param(
    [string]$AccountId,
    [string]$Bucket = 'webpic',
    [string]$PublicBaseUrl = 'https://webpic.235737.xyz',
    [string]$FilenameTemplate = '[timestamp]_[hash:6].[ext]',
    [switch]$UseApiToken
)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1')
Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Utility/Microsoft.PowerShell.Utility.psd1')
$storePath = if ($env:IMAGE_HOST_CONFIG_DIR) { $env:IMAGE_HOST_CONFIG_DIR } else { Join-Path $env:LOCALAPPDATA 'Codex\image-host-webpic' }
$secretPath = Join-Path $storePath 'credentials.dpapi'

function Read-Secret([string]$Prompt) {
    $secure = Read-Host $Prompt -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

$credentials = @{}
if (Test-Path -LiteralPath $secretPath) {
    $secure = ConvertTo-SecureString ((Get-Content -LiteralPath $secretPath -Raw).Trim())
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        $existing = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) | ConvertFrom-Json
        foreach ($property in $existing.PSObject.Properties) { $credentials[$property.Name] = $property.Value }
    } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}
if ($AccountId) { $credentials.accountId = $AccountId }
if (-not $credentials.accountId) { $credentials.accountId = Read-Host 'Cloudflare Account ID' }
if ($credentials.accountId -notmatch '^[a-fA-F0-9]{32}$') { throw 'Account ID must contain 32 hexadecimal characters.' }

if ($UseApiToken) {
    $token = Read-Secret 'Cloudflare R2 API Token (hidden; blank keeps existing)'
    if ($token) {
        $verified = Invoke-RestMethod -Uri 'https://api.cloudflare.com/client/v4/user/tokens/verify' -Headers @{ Authorization = 'Bearer ' + $token }
        if (-not $verified.success -or $verified.result.status -ne 'active') { throw 'API Token verification failed.' }
        $credentials.accessKeyId = $verified.result.id
        $hasher = [Security.Cryptography.SHA256]::Create()
        try { $credentials.secretAccessKey = [BitConverter]::ToString($hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($token))).Replace('-', '').ToLowerInvariant() }
        finally { $hasher.Dispose() }
        $credentials.Remove('cloudflareApiToken')
    }
} else {
    $access = Read-Host 'R2 Access Key ID (blank keeps existing)'
    $secret = Read-Secret 'R2 Secret Access Key (hidden; blank keeps existing)'
    if ($access) { $credentials.accessKeyId = $access }
    if ($secret) { $credentials.secretAccessKey = $secret }
}
$tinify = Read-Secret 'Tinify API Key (hidden; blank keeps existing)'
if ($tinify) { $credentials.tinifyKey = $tinify }
if (-not $credentials.accessKeyId -or -not $credentials.secretAccessKey -or -not $credentials.tinifyKey) { throw 'Required credentials are missing.' }

New-Item -ItemType Directory -Path $storePath -Force | Out-Null
$credentials | ConvertTo-Json -Compress | ConvertTo-SecureString -AsPlainText -Force | ConvertFrom-SecureString | Set-Content -LiteralPath $secretPath -Encoding utf8
@{ bucket = $Bucket; publicBaseUrl = $PublicBaseUrl; filenameTemplate = $FilenameTemplate; compression = 'tinify' } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $storePath 'config.json') -Encoding utf8
Write-Output 'Encrypted credentials saved for the current Windows user. Run node scripts/image-host.mjs check to validate.'
