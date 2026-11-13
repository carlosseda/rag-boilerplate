const path = require('path')
const fs = require('fs/promises')

module.exports = class OCRService {

  async executeOCR(url, filePath) {
    const { mimetype } = await this.validFileExtension(filePath)
    const buffer = await fs.readFile(filePath)  
    const form = new FormData()
  
    form.append(
      'file',
      new Blob([buffer], { type: mimetype }),
      path.basename(filePath)
    )
  
    form.append('dpi', '200')
    form.append('crop_mode', 'true')
    form.append('tokens_per_page', '4000')
      
    const response = await fetch(`${url}/ocr`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OCR_API_KEY}`
      },
      body: form,
      signal: AbortSignal.timeout(900000)
    })
  
    if (!response.ok) {
      throw new Error(
        `OCR HTTP ${response.status}: ${await response.text()}`
      )
    }
  
    const result = await response.json()
    return result.text
  }

  async validFileExtension(filePath){
   const types = {
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp'
    }
  
    const extension = path.extname(filePath).toLowerCase()
    const mimetype = types[extension]
  
    return { valid: Boolean(mimetype), extension, mimetype }
  }
}
