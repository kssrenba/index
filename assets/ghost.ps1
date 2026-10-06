param(
    [string]$Candidates,
    [string]$Result,
    [string]$Prompt = ''
)

[Console]::OutputEncoding = [Text.Encoding]::UTF8
$Prompt = $Prompt + ' '

$list = @()
if ($Candidates -and (Test-Path -LiteralPath $Candidates)) {
    $list = @(Get-Content -LiteralPath $Candidates -Encoding UTF8 | Where-Object { $_ } | Sort-Object -Unique)
}

function Get-Ghost([string]$t) {
    if (-not $t) { return '' }
    $m = $list | Where-Object {
        $_.StartsWith($t, [StringComparison]::OrdinalIgnoreCase) -and $_.Length -gt $t.Length
    } | Select-Object -First 1
    if ($m) { return $m.Substring($t.Length) }
    return ''
}

$buf  = ''
$top  = [Console]::CursorTop
$last = 0

function Draw([bool]$showGhost) {
    $g = ''
    if ($showGhost) { $g = Get-Ghost $buf }
    [Console]::SetCursorPosition(0, $top)
    [Console]::Write($Prompt + $buf)
    $x = [Console]::CursorLeft
    $y = [Console]::CursorTop
    [Console]::ForegroundColor = 'DarkGray'
    [Console]::Write($g)
    [Console]::ResetColor()
    $len = $Prompt.Length + $buf.Length + $g.Length
    if ($last -gt $len) { [Console]::Write(' ' * ($last - $len)) }
    $script:last = $len
    [Console]::SetCursorPosition($x, $y)
}

$done = $false
while (-not $done) {
    Draw $true
    $k = [Console]::ReadKey($true)
    switch ($k.Key) {
        'Escape'     { [Console]::WriteLine(); exit 1 }
        'Enter'      { $done = $true }
        'Backspace'  { if ($buf.Length -gt 0) { $buf = $buf.Substring(0, $buf.Length - 1) } }
        'Tab'        { $buf += (Get-Ghost $buf) }
        'RightArrow' { $buf += (Get-Ghost $buf) }
        default {
            if ($k.KeyChar -and -not [char]::IsControl($k.KeyChar)) { $buf += $k.KeyChar }
        }
    }
}

Draw $false
[Console]::WriteLine()

if ($Result) {
    [IO.File]::WriteAllText($Result, $buf, (New-Object Text.UTF8Encoding($false)))
}