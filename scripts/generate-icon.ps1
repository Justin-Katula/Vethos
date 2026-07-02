Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = "Stop"

$srcPath = "C:\Users\obedi\Nexus\scratch\transparent_logo.png"
$destIcoPath = "C:\Users\obedi\Nexus\build\icon.ico"
$destPngPath = "C:\Users\obedi\Nexus\build\icon.png"

# Ensure build folder exists
if (!(Test-Path "C:\Users\obedi\Nexus\build")) {
    New-Item -ItemType Directory -Path "C:\Users\obedi\Nexus\build" | Out-Null
}

# Load source image
$loadedImg = [System.Drawing.Bitmap]::FromFile($srcPath)

function Get-TrimBounds {
    param(
        [System.Drawing.Bitmap]$Bitmap,
        [int]$AlphaThreshold = 32
    )

    $w = $Bitmap.Width
    $h = $Bitmap.Height
    $minX = $w
    $minY = $h
    $maxX = -1
    $maxY = -1
    $minPixelsPerColumn = [Math]::Max(8, [Math]::Floor($h * 0.012))
    $minPixelsPerRow = [Math]::Max(8, [Math]::Floor($w * 0.012))

    for ($x = 0; $x -lt $w; $x++) {
        $count = 0
        for ($y = 0; $y -lt $h; $y++) {
            if ($Bitmap.GetPixel($x, $y).A -gt $AlphaThreshold) {
                $count++
            }
        }
        if ($count -ge $minPixelsPerColumn) {
            if ($x -lt $minX) { $minX = $x }
            if ($x -gt $maxX) { $maxX = $x }
        }
    }

    for ($y = 0; $y -lt $h; $y++) {
        $count = 0
        for ($x = 0; $x -lt $w; $x++) {
            if ($Bitmap.GetPixel($x, $y).A -gt $AlphaThreshold) {
                $count++
            }
        }
        if ($count -ge $minPixelsPerRow) {
            if ($y -lt $minY) { $minY = $y }
            if ($y -gt $maxY) { $maxY = $y }
        }
    }

    if ($maxX -lt $minX -or $maxY -lt $minY) {
        return New-Object System.Drawing.Rectangle(0, 0, $w, $h)
    }

    return New-Object System.Drawing.Rectangle($minX, $minY, ($maxX - $minX + 1), ($maxY - $minY + 1))
}

$trim = Get-TrimBounds -Bitmap $loadedImg
$cropSide = [int][Math]::Max($trim.Width, $trim.Height)
$padding = 0
$cropSide = [int][Math]::Min([Math]::Max($cropSide + ($padding * 2), 1), [Math]::Min($loadedImg.Width, $loadedImg.Height))
$centerX = $trim.X + ($trim.Width / 2)
$centerY = $trim.Y + ($trim.Height / 2)
$cropX = [int][Math]::Round($centerX - ($cropSide / 2))
$cropY = [int][Math]::Round($centerY - ($cropSide / 2))
$cropX = [int][Math]::Max(0, [Math]::Min($loadedImg.Width - $cropSide, $cropX))
$cropY = [int][Math]::Max(0, [Math]::Min($loadedImg.Height - $cropSide, $cropY))
$cropRect = New-Object System.Drawing.Rectangle($cropX, $cropY, $cropSide, $cropSide)

$srcImg = New-Object System.Drawing.Bitmap($cropSide, $cropSide)
$srcG = [System.Drawing.Graphics]::FromImage($srcImg)
$srcG.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$srcG.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$srcG.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$srcG.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$srcG.Clear([System.Drawing.Color]::Transparent)
$srcG.DrawImage($loadedImg, (New-Object System.Drawing.Rectangle(0, 0, $cropSide, $cropSide)), $cropRect, [System.Drawing.GraphicsUnit]::Pixel)
$srcG.Dispose()
$loadedImg.Dispose()

$sizes = @(256, 128, 64, 48, 32, 16)
$pngStreams = @()
$pngData = @()

foreach ($size in $sizes) {
    # Create target bitmap
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    
    # Set high quality scaling settings
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    
    # Preserve transparent background for app and taskbar icons.
    $g.Clear([System.Drawing.Color]::Transparent)
    
    # Overfill the canvas so the mark reads as full-size in the Windows taskbar.
    $overfill = [int][Math]::Ceiling($size * 0.012)
    $drawSize = $size + ($overfill * 2)
    $g.DrawImage($srcImg, -$overfill, -$overfill, $drawSize, $drawSize)
    
    # Save to memory stream as PNG
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $bytes = $ms.ToArray()
    
    # Save the 256x256 image as the separate PNG icon as well
    if ($size -eq 256) {
        [System.IO.File]::WriteAllBytes($destPngPath, $bytes)
    }
    
    $pngData += ,$bytes
    
    $g.Dispose()
    $bmp.Dispose()
    $ms.Dispose()
}

$srcImg.Dispose()

# Now build the ICO file from PNG streams
$fs = New-Object System.IO.FileStream($destIcoPath, [System.IO.FileMode]::Create)
$bw = New-Object System.IO.BinaryWriter($fs)

# Write Header
$bw.Write([UInt16]0) # Reserved
$bw.Write([UInt16]1) # Type (1 = Icon)
$bw.Write([UInt16]($sizes.Count)) # Number of images

# Offset starts after header (6 bytes) + directory entries (16 bytes * count)
$offset = 6 + (16 * $sizes.Count)

for ($i = 0; $i -lt $sizes.Count; $i++) {
    $size = $sizes[$i]
    $data = $pngData[$i]
    
    # ICO width/height rules (0 means 256)
    $w = if ($size -eq 256) { 0 } else { $size }
    $h = if ($size -eq 256) { 0 } else { $size }
    
    $bw.Write([Byte]$w) # Width
    $bw.Write([Byte]$h) # Height
    $bw.Write([Byte]0)  # Color Palette
    $bw.Write([Byte]0)  # Reserved
    $bw.Write([UInt16]1) # Color Planes
    $bw.Write([UInt16]32) # Bits per pixel
    $bw.Write([UInt32]($data.Length)) # Size of image data
    $bw.Write([UInt32]$offset) # Offset
    
    $offset += $data.Length
}

# Write Image Data
for ($i = 0; $i -lt $sizes.Count; $i++) {
    $data = $pngData[$i]
    $bw.Write($data, 0, $data.Length)
}

$bw.Close()
$fs.Close()

Write-Output "Successfully generated $destIcoPath and $destPngPath"
