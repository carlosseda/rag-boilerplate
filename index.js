const fs = require('fs/promises');
const path = require('path');
const VastAIService = require('./services/vastai-service')
const OCRService = require('./services//ocr-service')
const OpenAIService = require('./services/openai-service')
const VectorService = require('./services/vector-service')
const PDFService = require('./services/pdf-service')

async function main() {

  try {
    if (!process.env.VAST_API_KEY || !process.env.OCR_API_KEY) {
      throw new Error('Faltan credenciales o ruta del documento')
    }

    const ocrService = new OCRService()
    const openAIService = new OpenAIService()
    const pdfService = new PDFService()
    const vastAIService = new VastAIService()

    const vastInstanceUrl = await vastAIService.getMachine(process.env.VAST_INSTANCE_ID)

    while(true){
      let state = await vastAIService.checkModel(vastInstanceUrl, process.env.OCR_API_KEY)

      if(state){
        break
      }

      await new Promise(resolve => setTimeout(resolve, 10_000))
    }

    const folderPath = path.join(__dirname, 'input')
    const results = []

    for await (const filePath of extractFilesFromFolder(folderPath)) {
      const relativePath = path.relative(folderPath, filePath)
      const ocrOutputPath = path.join(__dirname, 'output', 'ocr', `${relativePath}.txt`)
      const result = await processFile(filePath, { ocrService, pdfService, openAIService, vastInstanceUrl, ocrOutputPath })

      if (result) {
        results.push({ reference: relativePath.split(path.sep).join('/'), ...result })
      }
    }

    const outputDir = path.join(__dirname, 'output', 'keywords')
    const jsonFile = path.join(outputDir, 'keywords.json')
    await fs.mkdir(outputDir, { recursive: true })
    await fs.writeFile(jsonFile, JSON.stringify(results, null, 2), 'utf8')

    if (results.length === 0) return

    const data = results.reduce((acc, element) => {
      acc.ids.push(element.reference)
      acc.documents.push(element.keywords)
      acc.metadatas.push({
        "filepath": element.filepath,
        "filename": element.filename,
        "filetype": element.filetype,
        "text": element.text
      })

      return acc
    }, {
      ids: [],
      documents: [],
      metadatas: []
    })

    const vectorService = new VectorService({
      clientOptions: {
        host: process.env.CHROMA_HOST || '127.0.0.1',
        port: Number(process.env.CHROMA_PORT || 8000),
        ssl: process.env.CHROMA_SSL === 'true',
        database: 'boib'
      }
    })
    await vectorService.getCollection('publications')
    await vectorService.addDocuments(data)

  } catch (error) {
    console.error('Error:', error.message)
  }
}

async function* extractFilesFromFolder(folderPath) {
  const entries = await fs.readdir(folderPath, { withFileTypes: true })

  for (const entry of entries) {
    const entryPath = path.join(folderPath, entry.name)

    if (entry.isDirectory()) {
      yield* extractFilesFromFolder(entryPath)
    } else if (entry.isFile()) {
      yield entryPath
    }
  }
}

async function processFile(filePath, { ocrService, pdfService, openAIService, vastInstanceUrl, ocrOutputPath }) {
  const { valid, extension, mimetype } = await ocrService.validFileExtension(filePath)

  if (!valid) return

  let text

  if (extension === '.pdf') {
    const tmpRoot = path.join(__dirname, 'output', 'tmp')
    await fs.mkdir(tmpRoot, { recursive: true })
    const tmpDir = await fs.mkdtemp(path.join(tmpRoot, 'pdf-'))

    try {
      const pdfPages = await pdfService.getPageCount(filePath)
      const pagesPerFile = 12

      if (pdfPages > pagesPerFile) {
        await pdfService.splitPDF({ filePath, pagesPerFile, outputDir: tmpDir })
      } else {
        await fs.copyFile(filePath, path.join(tmpDir, path.basename(filePath)))
      }

      const files = await fs.readdir(tmpDir)
      files.sort((first, second) => first.localeCompare(second, 'en', { numeric: true }))

      const parts = []

      for (const filename of files) {
        const partPath = path.join(tmpDir, filename)
        parts.push(await ocrService.executeOCR(vastInstanceUrl, partPath))
      }

      text = parts.join('\n\n')
      
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  } else {
    text = await ocrService.executeOCR(vastInstanceUrl, filePath)
  }

  await fs.mkdir(path.dirname(ocrOutputPath), { recursive: true })
  await fs.writeFile(ocrOutputPath, text ?? '', 'utf8')

  // if (extension !== '.pdf' && !text?.trim()) {
  //   const buffer = await fs.readFile(filePath)
  //   const response = await openAIService.analyzeImageBuffer([{ buffer, mimetype }], 'gpt-6.1-terra')
  //   text = response.output_text
  // }

  // const { output_text: keywords } = await openAIService.createResponse({
  //   input: `Extrae las palabras clave del siguiente texto y devuélvelas separadas por comas.\n\n${text}`,
  //   model: 'gpt-6-luna'
  // })

  // const embedding = await openAIService.generateEmbedding({ text: keywords })

  // return {
  //   filepath: filePath,
  //   filename: path.basename(filePath),
  //   filetype: extension,
  //   text,
  //   keywords,
  //   modelo: 'text-embedding-3-large',
  //   dimensiones: embedding.length,
  //   embedding
  // }

  return {
    text
  }
}

main();
