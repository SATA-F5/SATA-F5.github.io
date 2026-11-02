<#
  守禄の收藏夹 · 资源导入脚本
  ------------------------------------------------------------
  从三个来源挑选文件复制到 ./File，然后生成 File/manifest.js。

  收录规则（为满足 GitHub Pages 约 1 GB 的站点上限）：
    · B 站：全部音频 + 封面；没有音频的条目复制 100 MB 以内的视频
    · 本地音乐：mp3 / wav / flac 等全部复制
    · 本地视频：按 SHA-256 去重后，只复制 50 MB 以内的 mp4

  用法：
    powershell -ExecutionPolicy Bypass -File tools/import-favorites.ps1
#>

param(
  [string]$BiliSource  = 'C:\Users\Server\.savebili\media',
  [string]$MusicSource = 'D:\Music\音乐',
  [string]$VideoSource = 'D:\Videos',
  [int]$MaxVideoMB     = 50,
  [int]$MaxBiliVideoMB = 100
)

$ErrorActionPreference = 'Stop'

$Root     = Split-Path -Parent $PSScriptRoot
$FileDir  = Join-Path $Root 'File'
$BiliDest = Join-Path $FileDir 'bilibili'
$MusicDest= Join-Path $FileDir 'music'
$VideoDest= Join-Path $FileDir 'videos'

foreach ($d in @($FileDir, $BiliDest, $MusicDest, $VideoDest)) {
  if (-not (Test-Path -LiteralPath $d)) {
    New-Item -ItemType Directory -Path $d | Out-Null
  }
}

$script:copied = 0
$script:skipped = @()

function Copy-One {
  param([string]$Source, [string]$DestDir)
  $target = Join-Path $DestDir (Split-Path -Leaf $Source)
  if ((Test-Path -LiteralPath $target) -and
      ((Get-Item -LiteralPath $target).Length -eq (Get-Item -LiteralPath $Source).Length)) {
    return
  }
  Copy-Item -LiteralPath $Source -Destination $target -Force
  $script:copied++
}

Write-Host '== 1/3  复制 B 站收藏 ==' -ForegroundColor Cyan

$groups = @{}
if (Test-Path -LiteralPath $BiliSource) {
  $biliFiles = Get-ChildItem -LiteralPath $BiliSource -File -Force |
    Where-Object { $_.Extension -in '.mp3', '.mp4', '.jpg' }

  foreach ($f in $biliFiles) {
    $base = $null
    $slot = $null
    if ($f.Extension -eq '.jpg') {
      if ($f.BaseName -match '^(.*)_cover$') {
        $base = $Matches[1]
        $slot = 'Cover'
      } else { continue }
    } else {
      $base = $f.BaseName
      $slot = if ($f.Extension -eq '.mp3') { 'Audio' } else { 'Video' }
    }

    if (-not $groups.ContainsKey($base)) {
      $groups[$base] = [pscustomobject]@{
        Title = $base; Audio = $null; Video = $null; Cover = $null
      }
    }
    $groups[$base].$slot = $f
  }
}

foreach ($g in $groups.Values) {
  $hasMedia = ($g.Audio -or $g.Video)
  if (-not $hasMedia) { continue }

  if ($g.Cover) {
    Copy-One $g.Cover.FullName $BiliDest
  }

  if ($g.Audio) {
    Copy-One $g.Audio.FullName $BiliDest
  } elseif ($g.Video) {
    if ($g.Video.Length -le ($MaxBiliVideoMB * 1MB)) {
      Copy-One $g.Video.FullName $BiliDest
    } else {
      $script:skipped += [pscustomobject]@{
        Name = $g.Video.Name
        SizeMB = [math]::Round($g.Video.Length / 1MB, 1)
        Reason = "B 站视频超过 $MaxBiliVideoMB MB"
      }
    }
  }
}

Write-Host '== 2/3  复制本地音乐 ==' -ForegroundColor Cyan

$musicExt = '.mp3', '.wav', '.flac', '.m4a', '.aac', '.ogg'
if (Test-Path -LiteralPath $MusicSource) {
  Get-ChildItem -LiteralPath $MusicSource -File -Force |
    Where-Object { $_.Extension -in $musicExt } |
    ForEach-Object { Copy-One $_.FullName $MusicDest }
}

Write-Host '== 3/3  复制本地视频（去重） ==' -ForegroundColor Cyan

$seenHash = @{}
if (Test-Path -LiteralPath $VideoSource) {
  $videoFiles = Get-ChildItem -LiteralPath $VideoSource -File -Filter *.mp4 |
    Where-Object { $_.Length -le ($MaxVideoMB * 1MB) } |
    Sort-Object Name

  foreach ($f in $videoFiles) {
    $hash = (Get-FileHash -LiteralPath $f.FullName -Algorithm SHA256).Hash
    if ($seenHash.ContainsKey($hash)) {
      $script:skipped += [pscustomobject]@{
        Name = $f.Name
        SizeMB = [math]::Round($f.Length / 1MB, 1)
        Reason = '与已收录视频内容相同（去重）'
      }
      continue
    }
    $seenHash[$hash] = $true
    Copy-One $f.FullName $VideoDest
  }

  Get-ChildItem -LiteralPath $VideoSource -File -Filter *.mp4 |
    Where-Object { $_.Length -gt ($MaxVideoMB * 1MB) } |
    ForEach-Object {
      $script:skipped += [pscustomobject]@{
        Name = $_.Name
        SizeMB = [math]::Round($_.Length / 1MB, 1)
        Reason = "超过 $MaxVideoMB MB"
      }
    }
}

Write-Host ''
Write-Host '== 生成 File/manifest.js ==' -ForegroundColor Cyan

function Get-FileInfoSafe {
  param([string]$Path)
  if ($Path -and (Test-Path -LiteralPath $Path)) {
    return Get-Item -LiteralPath $Path
  }
  return $null
}

function To-RelPath {
  param([string]$FullName)
  $rel = $FullName.Substring($Root.Length).TrimStart('\', '/')
  return ($rel -replace '\\', '/')
}

$items = New-Object System.Collections.Generic.List[object]

# ---- B 站收藏：按标题合并 mp3 / mp4 / 封面 ----
$biliGaroups = @{}
foreach ($f in (Get-ChildItem -LiteralPath $BiliDest -File -Force)) {
  $base = $null; $slot = $null
  if ($f.Extension -eq '.jpg') {
    if ($f.BaseName -match '^(.*)_cover$') { $base = $Matches[1]; $slot = 'Cover' } else { continue }
  } else {
    $base = $f.BaseName
    $slot = if ($f.Extension -eq '.mp3') { 'Audio' } else { 'Video' }
  }
  if (-not $biliGaroups.ContainsKey($base)) {
    $biliGaroups[$base] = [pscustomobject]@{
      Title = $base; Audio = $null; Video = $null; Cover = $null
    }
  }
  $biliGaroups[$base].$slot = $f
}

foreach ($g in $biliGaroups.Values) {
  if (-not $g.Audio -and -not $g.Video) { continue }

  $media = if ($g.Audio) { $g.Audio } else { $g.Video }
  $dates = @($media.LastWriteTime)
  if ($g.Cover) { $dates += $g.Cover.LastWriteTime }
  $date = ($dates | Sort-Object -Descending | Select-Object -First 1)
  $type = if ($g.Video -and -not $g.Audio) { 'video' } else { 'music' }

  $items.Add([pscustomobject]@{
    id       = 'bili-' + [guid]::NewGuid().ToString('N').Substring(0, 10)
    title    = $g.Title
    type     = $type
    source   = 'bilibili'
    file     = To-RelPath $media.FullName
    audio    = if ($g.Audio) { To-RelPath $g.Audio.FullName } else { $null }
    video    = if ($g.Video) { To-RelPath $g.Video.FullName } else { $null }
    cover    = if ($g.Cover) { To-RelPath $g.Cover.FullName } else { $null }
    size     = [long]$media.Length
    date     = $date.ToString('yyyy-MM-dd')
    ts       = [long]([DateTimeOffset]$date).ToUnixTimeMilliseconds()
    ext      = $media.Extension.TrimStart('.').ToUpper()
  })
}

# ---- 本地音乐 ----
foreach ($f in (Get-ChildItem -LiteralPath $MusicDest -File -Force)) {
  $items.Add([pscustomobject]@{
    id       = 'music-' + [guid]::NewGuid().ToString('N').Substring(0, 10)
    title    = $f.BaseName
    type     = 'music'
    source   = 'music'
    file     = To-RelPath $f.FullName
    audio    = To-RelPath $f.FullName
    video    = $null
    cover    = $null
    size     = [long]$f.Length
    date     = $f.LastWriteTime.ToString('yyyy-MM-dd')
    ts       = [long]([DateTimeOffset]$f.LastWriteTime).ToUnixTimeMilliseconds()
    ext      = $f.Extension.TrimStart('.').ToUpper()
  })
}

# ---- 本地视频 ----
foreach ($f in (Get-ChildItem -LiteralPath $VideoDest -File -Force)) {
  $title = $f.BaseName -replace '_[0-9]{10}$', ''
  $items.Add([pscustomobject]@{
    id       = 'video-' + [guid]::NewGuid().ToString('N').Substring(0, 10)
    title    = $title
    type     = 'video'
    source   = 'video'
    file     = To-RelPath $f.FullName
    audio    = $null
    video    = To-RelPath $f.FullName
    cover    = $null
    size     = [long]$f.Length
    date     = $f.LastWriteTime.ToString('yyyy-MM-dd')
    ts       = [long]([DateTimeOffset]$f.LastWriteTime).ToUnixTimeMilliseconds()
    ext      = $f.Extension.TrimStart('.').ToUpper()
  })
}

$sorted = $items | Sort-Object -Property @{ Expression = 'ts'; Descending = $true }, @{ Expression = 'title'; Descending = $false }

$totalSize = ($sorted | Measure-Object -Property size -Sum).Sum
$payload = [ordered]@{
  generated = (Get-Date).ToString('yyyy-MM-dd HH:mm')
  totalSize = [long]$totalSize
  counts    = [ordered]@{
    all      = @($sorted).Count
    music    = @($sorted | Where-Object type -eq 'music').Count
    video    = @($sorted | Where-Object type -eq 'video').Count
    bilibili = @($sorted | Where-Object source -eq 'bilibili').Count
    musicLocal = @($sorted | Where-Object source -eq 'music').Count
    videoLocal = @($sorted | Where-Object source -eq 'video').Count
  }
  items     = @($sorted)
}

$json = $payload | ConvertTo-Json -Depth 8
$js   = "/* 由 tools/import-favorites.ps1 自动生成，请勿手动编辑 */`r`nwindow.FAVORITES = $json;`r`n"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $FileDir 'manifest.js'), $js, $utf8NoBom)

# ---- 收录说明 ----
$reasonLines = ($script:skipped | Sort-Object SizeMB -Descending |
  ForEach-Object { "- $($_.Name)（$($_.SizeMB) MB）— $($_.Reason)" }) -join "`r`n"
if (-not $reasonLines) { $reasonLines = '- 无' }

$readme = @"
# 守禄の收藏夹 · File 目录说明

本目录由 tools/import-favorites.ps1 自动整理生成。

- 收录条目：$($payload.counts.all) 件
- 收录大小：$('{0:N1}' -f ($totalSize / 1MB)) MB
- 更新时间：$($payload.generated)

## 目录

- bilibili/ — B 站收藏（音频、封面、少量视频）
- music/ — 本地音乐
- videos/ — 本地视频（已去重）
- manifest.js — 页面读取的资源清单

## 收录规则

- B 站：全部音频与封面；没有音频的条目收录 100 MB 以内的视频
- 本地音乐：mp3 / wav / flac 全部收录
- 本地视频：按 SHA-256 去重，只收录 50 MB 以内的 mp4
- 说明：GitHub Pages 单站约 1 GB、单文件 100 MB，因此未收录大文件

## 未收录的文件

$reasonLines
"@
[System.IO.File]::WriteAllText((Join-Path $FileDir '收录说明.md'), $readme, $utf8NoBom)

Write-Host ''
Write-Host ("完成：{0} 件，{1:N1} MB（本次新复制 {2} 个文件）" -f $payload.counts.all, ($totalSize / 1MB), $script:copied) -ForegroundColor Green
Write-Host ("清单：{0}" -f (Join-Path $FileDir 'manifest.js'))
