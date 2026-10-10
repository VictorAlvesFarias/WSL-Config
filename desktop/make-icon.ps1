# Draws build/icon.png (512x512): three stacked layers (the distros) on a blue rounded square.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$size = 512
$bitmap = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bitmap)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::Transparent)

function New-RoundedRect ([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc($x, $y, $r, $r, 180, 90)
    $path.AddArc($x + $w - $r, $y, $r, $r, 270, 90)
    $path.AddArc($x + $w - $r, $y + $h - $r, $r, $r, 0, 90)
    $path.AddArc($x, $y + $h - $r, $r, $r, 90, 90)
    $path.CloseFigure()
    $path
}

# Background.
$g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(37, 99, 235))), (New-RoundedRect 0 0 $size $size 112))

$white = [System.Drawing.Color]::White
$pen = New-Object System.Drawing.Pen $white, 28
$pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
$pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

# Top layer: a filled diamond.
$top = New-Object System.Drawing.Drawing2D.GraphicsPath
$top.AddPolygon([System.Drawing.PointF[]]@(
    (New-Object System.Drawing.PointF 256, 104),
    (New-Object System.Drawing.PointF 416, 184),
    (New-Object System.Drawing.PointF 256, 264),
    (New-Object System.Drawing.PointF 96, 184)
))
$g.FillPath((New-Object System.Drawing.SolidBrush $white), $top)
$g.DrawPath($pen, $top)

# Two layers below: open chevrons.
foreach ($y in 264, 344) {
    $g.DrawLines($pen, [System.Drawing.PointF[]]@(
        (New-Object System.Drawing.PointF 96, $y),
        (New-Object System.Drawing.PointF 256, ($y + 80)),
        (New-Object System.Drawing.PointF 416, $y)
    ))
}

$out = Join-Path $PSScriptRoot '..\build\icon.png'
New-Item -ItemType Directory -Force (Split-Path $out) | Out-Null
$bitmap.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bitmap.Dispose()
Write-Output "Wrote $out"
