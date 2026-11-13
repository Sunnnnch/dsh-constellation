/**
 * Optional read-only adapters for external monitoring panels.
 *
 * We are agentless and SSH-first; a Komari/Nezha deployment already owns long
 * history, alerting and status pages. Instead of copying that backend, the panel
 * can pull its node list and latest numbers and show them next to our own
 * samples. Both adapters are tolerant about envelopes because the projects
 * change field shapes between minor releases.
 */

/** Join a base URL and a path without doubling slashes. */
function joinUrl(base, path) {
  return `${String(base).replace(/\/+$/, '')}${path}`
}

/** GET JSON with a timeout; throws a short, actionable message. */
async function fetchJson(url, { headers = {}, signal, timeoutMs = 8000 } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  try {
    const response = await fetch(url, { headers, signal: controller.signal })
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`)
    return await response.json()
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}

/** Pull the array out of `{data: []}`, `{data: {value: []}}` or a bare array. */
function asArray(payload) {
  if (Array.isArray(payload)) return payload
  if (payload && Array.isArray(payload.data)) return payload.data
  if (payload && payload.data && Array.isArray(payload.data.value)) return payload.data.value
  return []
}

/** Percentage of used/total, rounded, or undefined. */
function pct(used, total) {
  if (!Number.isFinite(Number(used)) || !Number.isFinite(Number(total)) || Number(total) <= 0) return undefined
  return Math.round((Number(used) / Number(total)) * 1000) / 10
}

/** Whether a timestamp is recent enough to call the node online. */
function isRecent(value, windowMs = 180000) {
  if (!value) return undefined
  const time = typeof value === 'number' ? value : Date.parse(value)
  if (!Number.isFinite(time)) return undefined
  return Date.now() - time <= windowMs
}

/** Map one Komari node plus its newest record. */
function mapKomariNode(node, record) {
  const online = record ? isRecent(record.time) : undefined
  return {
    id: node.uuid || node.id,
    name: node.name || node.uuid,
    online,
    cpu: record && Number.isFinite(Number(record.cpu)) ? Number(record.cpu) : undefined,
    mem: record ? pct(record.ram, record.ram_total) : undefined,
    disk: record ? pct(record.disk, record.disk_total) : undefined,
    load: record && Number.isFinite(Number(record.load)) ? Number(record.load) : undefined,
    traffic: record ? Number(record.net_total_up || 0) + Number(record.net_total_down || 0) : undefined,
    price: Number.isFinite(Number(node.price)) && Number(node.price) > 0 ? Number(node.price) : undefined,
    expiresAt: node.expired_at || undefined,
    region: node.region || undefined,
  }
}

/** Komari: node list, then the newest report for the first dozen nodes. */
async function fetchKomari(source, token, signal) {
  const headers = token ? { authorization: `Bearer ${token}` } : {}
  const listed = await fetchJson(joinUrl(source.baseUrl, '/api/nodes'), { headers, signal })
  const nodes = asArray(listed)
  const limited = nodes.slice(0, 12)
  const details = await Promise.all(
    limited.map(async (node) => {
      try {
        const recent = await fetchJson(joinUrl(source.baseUrl, `/api/recent/${encodeURIComponent(node.uuid || node.id)}`), { headers, signal, timeoutMs: 5000 })
        const rows = asArray(recent)
        return rows.length ? rows[rows.length - 1] : undefined
      } catch {
        return undefined
      }
    }),
  )
  return limited.map((node, index) => mapKomariNode(node, details[index]))
}

/** Nezha: server list plus a DB-backed online-history read per server. */
async function fetchNezha(source, token, signal) {
  const headers = token ? { authorization: `Bearer ${token}` } : {}
  const listed = await fetchJson(joinUrl(source.baseUrl, '/api/v1/server'), { headers, signal })
  const servers = asArray(listed)
  const limited = servers.slice(0, 12)
  const histories = await Promise.all(
    limited.map(async (server) => {
      try {
        const history = await fetchJson(joinUrl(source.baseUrl, `/api/v1/server/${encodeURIComponent(server.id)}/online-history?days=1`), { headers, signal, timeoutMs: 5000 })
        return history && history.data ? history.data : undefined
      } catch {
        return undefined
      }
    }),
  )
  return limited.map((server, index) => {
    const history = histories[index]
    return {
      id: String(server.id),
      name: server.name || String(server.id),
      online: typeof server.online === 'boolean' ? server.online : history ? history.currently_online : undefined,
      cpu: Number.isFinite(Number(server.cpu)) ? Number(server.cpu) : undefined,
      mem: pct(server.mem_used, server.mem_total),
      disk: pct(server.disk_used, server.disk_total),
      onlineRate: history && Number.isFinite(Number(history.online_rate)) ? Number(history.online_rate) : undefined,
      price: Number.isFinite(Number(server.price)) && Number(server.price) > 0 ? Number(server.price) : undefined,
      expiresAt: server.expired_at || undefined,
      region: server.country_code || undefined,
    }
  })
}

/**
 * Fetch one configured source.
 * @param {{name?: string, kind?: string, baseUrl: string, tokenRef?: string}} source
 * @param {string|undefined} token - resolved secret, never logged
 */
export async function fetchMonitor(source, token, signal) {
  const kind = source.kind === 'nezha' ? 'nezha' : 'komari'
  if (!source.baseUrl) throw new Error('监控源缺少 baseUrl')
  const nodes = kind === 'nezha' ? await fetchNezha(source, token, signal) : await fetchKomari(source, token, signal)
  return {
    name: source.name || source.baseUrl,
    kind,
    baseUrl: source.baseUrl,
    ok: true,
    fetchedAt: new Date().toISOString(),
    nodes,
  }
}
