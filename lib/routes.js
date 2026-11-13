import { createReadStream, createWriteStream, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { randomUUID } from 'node:crypto'
import * as ssh from './ssh.js'

/** JSON response helper. */
function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
}

/** Uniform error envelope so the panel can render one message shape. */
function failure(error) {
  return json({ ok: false, error: ssh.messageOf(error) }, 200)
}

/** Sessions opened for the browser terminal panel, keyed by opaque id. */
class WebTerminals {
  constructor(service, config) {
    this.service = service
    this.config = config
    this.sessions = new Map()
  }

  /** Open one interactive shell and start buffering its output. */
  async open(hostId, options = {}) {
    const { host, client } = await this.service.connect(hostId)
    const channel = await new Promise((resolve, reject) => {
      client.shell({ term: 'xterm-256color', cols: options.cols || 120, rows: options.rows || 32 }, (error, stream) => {
        if (error) reject(new Error(`打开会话失败：${ssh.messageOf(error)}`))
        else resolve(stream)
      })
    })
    const id = randomUUID()
    const session = { id, hostId, channel, seq: 0, chunks: [], bytes: 0, subscribers: new Set(), closed: false, truncated: false }
    const push = (text) => {
      session.seq += 1
      session.chunks.push({ seq: session.seq, text })
      session.bytes += text.length
      // Bound scrollback memory: 4000 chunks or ~1 MiB, whichever comes first.
      while ((session.chunks.length > 4000 || session.bytes > 1024 * 1024) && session.chunks.length > 1) {
        const dropped = session.chunks.shift()
        session.bytes -= dropped.text.length
        session.truncated = true
      }
      for (const send of session.subscribers) send(session.seq, text)
    }
    channel.on('data', (chunk) => push(chunk.toString('utf8')))
    channel.stderr?.on('data', (chunk) => push(chunk.toString('utf8')))
    const finish = () => {
      if (session.closed) return
      session.closed = true
      for (const send of session.subscribers) send(session.seq, '')
      session.subscribers.clear()
    }
    channel.on('close', finish)
    channel.on('error', finish)
    this.sessions.set(id, session)
    return { id, hostId: host.id }
  }

  /** Write user input into the channel. */
  write(id, text) {
    const session = this.sessions.get(id)
    if (!session) throw new Error('会话不存在或已关闭')
    session.channel.write(text)
  }

  /** Apply a terminal resize. */
  resize(id, cols, rows) {
    const session = this.sessions.get(id)
    if (!session) return
    try {
      session.channel.setWindow(rows, cols, 0, 0)
    } catch {}
  }

  /** Close one session. */
  close(id) {
    const session = this.sessions.get(id)
    if (!session) return
    this.sessions.delete(id)
    try {
      session.channel.close()
    } catch {}
  }

  /** Close everything at disposal. */
  dispose() {
    for (const id of [...this.sessions.keys()]) this.close(id)
  }
}

/**
 * Register the panel's HTTP surface: one JSON RPC endpoint, an upload stream,
 * a download stream, and the terminal SSE + input pair.
 */
export function registerRoutes(connection, service, config) {
  const webTerminals = new WebTerminals(service, config)
  const disposers = []

  const rpc = async (request) => {
    let payload
    try {
      payload = await request.json()
    } catch {
      return json({ ok: false, error: '请求体不是合法 JSON' }, 400)
    }
    try {
      const { op } = payload
      switch (op) {
        case 'hosts':
          return json({ ok: true, hosts: service.hosts() })
        case 'hostsAdd':
          return json({ ok: true, host: service.upsertHost(payload.host || {}) })
        case 'hostsRemove':
          return json({ ok: true, ...service.removeHost(payload.id) })
        case 'hostsImport':
          return json({ ok: true, ...service.importConfig() })
        case 'status':
          return json({ ok: true, status: await service.status(payload.host) })
        case 'latency':
          return json({ ok: true, latency: await service.latency(payload.host, payload.options || {}) })
        case 'secretSet':
          return json({ ok: true, ...(await service.setSecret(payload.ref, payload.value)) })
        case 'secretStatus':
          return json({ ok: true, status: await service.secretStatus(payload.refs) })
        case 'test':
          return json({ ok: true, result: await service.test(payload.host) })
        case 'hostForgetKey':
          return json({ ok: true, ...service.forgetFingerprint(payload.host) })
        case 'batch':
          return json({ ok: true, ...(await service.batch(payload.hosts, payload.command, payload.options || {})) })
        case 'history':
          return json({ ok: true, ...service.history(payload.host, { minutes: payload.minutes }) })
        case 'sample':
          return json({ ok: true, sample: await service.sampleHost(payload.host) })
        case 'alerts':
          return json({ ok: true, alerts: service.listAlerts() })
        case 'monitors':
          return json({ ok: true, monitors: await service.listMonitors({ refresh: payload.refresh }) })
        case 'monitorsConfig':
          return json({ ok: true, sources: service.monitorsConfig() })
        case 'monitorsSave':
          return json({ ok: true, sources: service.saveMonitors(payload.sources) })
        case 'audit':
          return json({ ok: true, records: service.readAudit({ host: payload.host, limit: payload.limit }) })
        case 'keyGenerate':
          return json({ ok: true, ...service.generateKey(payload.host) })
        case 'keyDeploy':
          return json({ ok: true, ...(await service.deployKey(payload.host)) })
        case 'inspect':
          return json({ ok: true, ...(await service.inspect(payload.host, payload.what)) })
        case 'tunnelsRestore':
          return json({ ok: true, ...(await service.restoreTunnels()) })
        case 'savedTunnels':
          return json({ ok: true, tunnels: service.savedTunnels() })
        case 'settings':
          return json({ ok: true, settings: service.config })
        case 'saveSettings':
          return json({ ok: true, settings: service.saveSettings(payload.settings || {}) })
        case 'inventoryExport':
          return json({ ok: true, ...service.exportInventory() })
        case 'inventoryImport':
          return json({ ok: true, ...service.importInventory(payload.inventory) })
        case 'overview':
          return json({ ok: true, hosts: service.overview(), thresholds: service.threeThresholds() })
        case 'probeAll':
          return json({ ok: true, results: await service.probeHosts(payload.hosts) })
        case 'threeNet':
          return json({ ok: true, ...(await service.threeNet(payload.host)) })
        case 'threeNetAll':
          return json({ ok: true, results: await service.threeNetAll() })
        case 'snippets':
          return json({ ok: true, snippets: service.snippets() })
        case 'snippetSave':
          return json({ ok: true, snippet: service.saveSnippet(payload.snippet || {}) })
        case 'snippetRemove':
          return json({ ok: true, ...service.removeSnippet(payload.id) })
        case 'exec':
          return json({ ok: true, result: await service.exec(payload.host, payload.command, { timeoutMs: payload.timeoutMs }) })
        case 'listDir':
          return json({ ok: true, entries: await service.listDir(payload.host, payload.path || '.') })
        case 'readFile':
          return json({ ok: true, ...(await service.readFile(payload.host, payload.path)) })
        case 'writeFile':
          return json({ ok: true, ...(await service.writeFile(payload.host, payload.path, payload.text ?? '')) })
        case 'renameFile':
          return json({ ok: true, ...(await service.renameFile(payload.host, payload.from, payload.to)) })
        case 'removeFile':
          return json({ ok: true, ...(await service.removeFile(payload.host, payload.path)) })
        case 'chmodFile':
          return json({ ok: true, ...(await service.chmodFile(payload.host, payload.path, payload.mode)) })
        case 'tunnels':
          return json({ ok: true, tunnels: service.listTunnels() })
        case 'tunnelOpen':
          return json({ ok: true, tunnel: await service.openTunnel(payload.options || {}) })
        case 'tunnelClose':
          return json({ ok: true, ...service.closeTunnel(payload.id) })
        case 'termOpen':
          return json({ ok: true, terminal: await webTerminals.open(payload.host, payload.options || {}) })
        case 'termWrite':
          return json({ ok: true, ...(webTerminals.write(payload.id, payload.text ?? ''), {}) })
        case 'termResize':
          webTerminals.resize(payload.id, payload.cols, payload.rows)
          return json({ ok: true })
        case 'termClose':
          webTerminals.close(payload.id)
          return json({ ok: true })
        default:
          return json({ ok: false, error: `未知操作 ${op}` }, 400)
      }
    } catch (error) {
      return failure(error)
    }
  }

  disposers.push(
    connection.fetch.register({
      path: '/api/vps.rpc',
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: rpc,
    }),
  )

  disposers.push(
    connection.fetch.register({
      path: '/api/vps.upload',
      methods: ['POST'],
      requestBody: 'streaming',
      async fetch(request) {
        const url = new URL(request.url)
        const host = url.searchParams.get('host')
        const remotePath = url.searchParams.get('path')
        if (!host || !remotePath) return json({ ok: false, error: '缺少 host 或 path' }, 400)
        const directory = mkdtempSync(join(tmpdir(), 'dsh-vps-'))
        const localPath = join(directory, 'upload.bin')
        try {
          await new Promise((resolve, reject) => {
            const sink = createWriteStream(localPath)
            sink.on('error', reject)
            sink.on('finish', resolve)
            if (!request.body) {
              sink.end()
              return
            }
            Readable.fromWeb(request.body).pipe(sink)
          })
          const result = await service.upload(host, localPath, remotePath)
          return json({ ok: true, ...result })
        } catch (error) {
          return failure(error)
        } finally {
          try {
            rmSync(directory, { recursive: true, force: true })
          } catch {}
        }
      },
    }),
  )

  disposers.push(
    connection.fetch.register({
      path: '/api/vps.download',
      methods: ['GET', 'HEAD'],
      requestBody: 'buffered',
      async fetch(request) {
        const url = new URL(request.url)
        const host = url.searchParams.get('host')
        const remotePath = url.searchParams.get('path')
        if (!host || !remotePath) return json({ ok: false, error: '缺少 host 或 path' }, 400)
        const directory = mkdtempSync(join(tmpdir(), 'dsh-vps-'))
        const localPath = join(directory, 'download.bin')
        try {
          await service.download(host, remotePath, localPath)
          if (request.method === 'HEAD') {
            rmSync(directory, { recursive: true, force: true })
            return new Response(null, { status: 200 })
          }
          const stream = createReadStream(localPath)
          stream.on('close', () => {
            try {
              rmSync(directory, { recursive: true, force: true })
            } catch {}
          })
          return new Response(Readable.toWeb(stream), {
            headers: { 'content-type': 'application/octet-stream', 'content-disposition': `attachment; filename="${remotePath.split('/').pop()}"`, 'cache-control': 'no-store' },
          })
        } catch (error) {
          try {
            rmSync(directory, { recursive: true, force: true })
          } catch {}
          return failure(error)
        }
      },
    }),
  )

  disposers.push(
    connection.fetch.register({
      path: '/api/vps.term',
      methods: ['GET'],
      requestBody: 'buffered',
      async fetch(request) {
        const url = new URL(request.url)
        const id = url.searchParams.get('id')
        const since = Number(url.searchParams.get('since') || 0)
        const session = webTerminals.sessions.get(id)
        if (!session) return json({ ok: false, error: '会话不存在' }, 404)
        const encoder = new TextEncoder()
        let unsubscribe = () => {}
        let closed = false
        const body = new ReadableStream({
          start(controller) {
            const send = (seq, text) => {
              if (closed) return
              try {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ seq, text })}\n\n`))
              } catch {}
            }
            for (const chunk of session.chunks) {
              if (chunk.seq > since) send(chunk.seq, chunk.text)
            }
            if (session.closed) {
              send(session.seq, '')
              closed = true
              controller.close()
              return
            }
            session.subscribers.add(send)
            unsubscribe = () => session.subscribers.delete(send)
          },
          cancel() {
            closed = true
            unsubscribe()
          },
        })
        return new Response(body, {
          headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive' },
        })
      },
    }),
  )

  return () => {
    webTerminals.dispose()
    for (const dispose of disposers) {
      try {
        const result = dispose()
        if (result?.catch) result.catch(() => {})
      } catch {}
    }
  }
}
