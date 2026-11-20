
module.exports = class VastAIService {

   async searchOffers ({
      gpuNames = ['RTX A5000', 'RTX A6000'],
      disk = 100,
      minReliability = 0.99,
      minDownloadMbps = 500,
      maxHourlyPrice,
      limit = 20
    } = {}) {

    const apiKey = process.env.VAST_API_KEY

    if (!apiKey) throw new Error('Falta VAST_API_KEY')

    if (!Array.isArray(gpuNames) || gpuNames.length === 0 || gpuNames.some(name => typeof name !== 'string' || !name.trim())) {
      throw new Error('gpuNames debe contener nombres de GPU')
    }

    if (!Number.isFinite(disk) || disk <= 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new Error('Disco o límite de ofertas no válido')
    }

    if (!Number.isFinite(minReliability) || minReliability < 0 || minReliability > 1) {
      throw new Error('La fiabilidad debe estar entre 0 y 1')
    }

    if (maxHourlyPrice !== undefined && (!Number.isFinite(maxHourlyPrice) || maxHourlyPrice <= 0)) {
      throw new Error('El precio máximo debe ser positivo')
    }

    if (!Number.isFinite(minDownloadMbps) || minDownloadMbps < 0) {
      throw new Error('La descarga mínima debe ser un número mayor o igual a cero (Mbps)')
    }
    const query = {
      type: 'on-demand',
      verified: { eq: true },
      rentable: { eq: true },
      rented: { eq: false },
      num_gpus: { eq: 1 },
      gpu_name: { in: gpuNames },
      disk_space: { gte: disk },
      reliability: { gte: minReliability },
      inet_down: { gte: minDownloadMbps },
      direct_port_count: { gte: 1 },
      allocated_storage: disk,
      order: [['dph_total', 'asc']],
      limit
    }

    if (maxHourlyPrice !== undefined) query.dph_total = { lte: maxHourlyPrice }

    const response = await fetch('https://console.vast.ai/api/v0/bundles', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(query),
      signal: AbortSignal.timeout(30000)
    })

    if (!response.ok) {
      throw new Error(`Consultar ofertas: HTTP ${response.status}: ${await response.text()}`)
    }

    const result = await response.json()

    if (!Array.isArray(result.offers)) {
      throw new Error(result.msg || 'Respuesta de ofertas de Vast.ai no válida')
    }

    return result.offers
  }

  async createInstance ({
    offerId,
    templateHash,
    disk = 100
  }) {
    const apiKey = process.env.VAST_API_KEY

    if (!apiKey || !offerId || !templateHash) {
      throw new Error('Faltan VAST_API_KEY, offerId o templateHash')
    }

    const response = await fetch(
      `https://console.vast.ai/api/v0/asks/${offerId}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          template_hash_id: templateHash,
          label: 'unlimited-ocr',
          disk,
          target_state: 'running'
        }),
        signal: AbortSignal.timeout(60000)
      }
    )

    if (!response.ok) {
      throw new Error(
        `Crear instancia: HTTP ${response.status}: ${await response.text()}`
      )
    }

    const result = await response.json()

    if (!result.success || !result.new_contract) {
      throw new Error(result.msg || 'Vast.ai no confirmó la creación')
    }

    return result.new_contract
  }

  async getMachine (vastInstanceId) {
    const response = await fetch(
      'https://console.vast.ai/api/v1/instances/?owner=me',
      {
        headers: {
          Authorization: `Bearer ${process.env.VAST_API_KEY}`
        }
      }
    )

    if (!response.ok) {
      const detalle = await response.text()
      throw new Error(
        `Vast.ai HTTP ${response.status}: ${detalle}`
      )
    }

    const data = await response.json()

    const candidates = data.instances.filter(i =>
      i.actual_status === 'running' &&
      i.ports?.['10001/tcp']?.[0]?.HostPort
    )

    const instance = vastInstanceId
      ? candidates.find(i => String(i.id) === vastInstanceId)
      : candidates.length === 1 ? candidates[0] : null

    if (!instance) {
      throw new Error(
        'No hay una instancia OCR única y operativa. ' +
        'Comprueba el puerto 10001 o indica VAST_INSTANCE_ID.'
      )
    }

    const ip = instance.public_ipaddr
    const port = instance.ports['10001/tcp'][0].HostPort

    if (!ip || !port) {
      throw new Error('IP o puerto público no disponible')
    }

    return `http://${ip}:${port}`
  }

  async checkModel(url, apiKey) {
    try{
      const response = await fetch(`${url}/ready`, {
        headers: {
          Authorization: `Bearer ${apiKey}`
        },
        signal: AbortSignal.timeout(15000)
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(
          `Vast.ai HTTP ${response.status}: ${detail}`
        );
      }

      return true
      
    }catch(error){
      console.log(error)
      return false
    }
  }
}
