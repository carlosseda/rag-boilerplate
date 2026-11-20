(async () => {
  const VectorService = require('./services/vector-service')
  const OpenAIService = require('./services/openai-service')
  const { answerGenerationSchema } = require('./ia/schemas')
  const { answerGenerationInstructions} = require('./ia/instructions')

  let userQuery = "¿Quienes son los responsable de encauzar las conversaciones con las entidades de discapacitados?"

  const vectorService = new VectorService({
    clientOptions: {
      host: process.env.CHROMA_HOST || '127.0.0.1',
      port: Number(process.env.CHROMA_PORT || 8000),
      ssl: process.env.CHROMA_SSL === 'true'
    }
  })

  await vectorService.getCollection('publications-openai')
  const result = await vectorService.query({queryTexts: [userQuery], nResults: 10})

  const input = `question: ${userQuery} queryResults: ${JSON.stringify(result)}`

  const openAIService = new OpenAIService()

  const response = await openAIService.createResponse({
    input,
    model: 'gpt-6-luna',
    options: {
      reasoning: {
        effort: 'low'
      },
      max_output_tokens: 16000,
      store: false,
      instructions: answerGenerationInstructions,
      prompt_cache_key: 'answer-generation-v1',
      text: {
        format: {
          type: 'json_schema',
          name: 'answer-generation',
          strict: true,
          schema: answerGenerationSchema
        }
      }
    }
  })

  data = JSON.parse(response.output_text)

  console.log(data)

})()
