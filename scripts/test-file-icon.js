const { app, nativeImage } = require('electron')
const fs = require('fs')
const path = require('path')

app.whenReady().then(async () => {
  const paths = [
    `C:\\Users\\obedi\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Antigravity.lnk`,
    `C:\\Users\\obedi\\AppData\\Local\\Programs\\antigravity\\Antigravity.exe`,
    `C:\\Program Files (x86)\\Steam\\steamapps\\common\\Call of Duty HQ\\cod.exe`,
    `C:\\Windows\\notepad.exe`
  ]

  for (const p of paths) {
    console.log(`Checking path: ${p}`)
    if (!fs.existsSync(p)) {
      console.log(`  File does not exist!`)
      continue
    }

    try {
      const image = await app.getFileIcon(p, { size: 'normal' })
      const isEmpty = image.isEmpty()
      console.log(`  IsEmpty: ${isEmpty}`)
      if (!isEmpty) {
        const dataUrl = image.toDataURL()
        // Print first 100 characters of base64
        console.log(`  Base64: ${dataUrl.slice(0, 100)}...`)
        // Save to file for manual viewing
        const fileName = path.basename(p) + '.png'
        fs.writeFileSync(fileName, image.toPNG())
        console.log(`  Saved to ${fileName}`)
      }
    } catch (err) {
      console.error(`  Error:`, err)
    }
  }

  app.quit()
})
