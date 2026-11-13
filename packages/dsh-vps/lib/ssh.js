import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import net from 'node:net'
import * as ssh2Module from 'ssh2'
import { createRequire } from 'node:module'
import { expandHome } from './inventory.js'
import { loadCommonJs } from './cjs.js'

// `ssh2`'s client class is a bare `module.exports = Client`. The host's CJS
// interop shallow-copies module exports, which turns a class into `{}`, so read
// `lib/client.js` through the small evaluator instead. The namespace walk is
// only a fallback for environments where that path is unavailable.
function loadClient() {
  try {
    const require = createRequire(import.meta.url)
    const entry = require.resolve('ssh2/lib/client.js')
    const loaded = loadCommonJs(entry)
    if (typeof loaded === 'function') return loaded
    if (loaded && typeof loaded.Client === 'function') return loaded.Client
  } catch {}
  let value = ssh2Module
  for (let depth = 0; depth < 4 && value; depth += 1) {
    if (typeof value.Client === 'function') return value.Client
    value = value.default
  }
  return undefined
}

const Client = loadClient()
if (typeof Client !== 'function') {
  throw new Error('dsh-vps: 无法加载 ssh2 的 Client 构造函数')
}

/** Generate one ed25519 keypair in OpenSSH format (ssh2's own keygen). */
export function generateKeyPair() {
  const keygen = loadCommonJs(createRequire(import.meta.url).resolve('ssh2/lib/keygen.js'))
  if (!keygen || typeof keygen.generateKeyPairSync !== 'function') throw new Error('ssh2 的 keygen 不可用')
  const pair = keygen.generateKeyPairSync('ed25519')
  return { privateKey: pair.private, publicKey: pair.public }
}

/** Live clients keyed by inventory id. */
const live = new Map()
/** Last successful use per host, for idle eviction. */
const lastUsed = new Map()
/** In-flight connection attempts keyed by inventory id. */
const connecting = new Map()

/** Injected by the plugin: resolves a credential key name to its secret value. */
let resolveSecret = async () => undefined
/** Injected by the plugin: persists a newly pinned host key fingerprint. */
let rememberFingerprint = () => {}

/** Install host-supplied secret and fingerprint hooks. */
export function configure(options) {
  if (options.resolveSecret) resolveSecret = options.resolveSecret
  if (options.rememberFingerprint) rememberFingerprint = options.rememberFingerprint
}

/** Human-readable single line for any thrown value. */
export function messageOf(error) {
  if (error instanceof Error) return error.message
  return String(error)
}

/** Compute the OpenSSH-style SHA256 fingerprint of a raw host key. */
export function fingerprintOf(key) {
  const digest = createHash('sha256').update(key).digest('base64').replace(/=+$/, '')
  return `SHA256:${digest}`
}

/** Resolve ssh2 connection options for one inventory host. */
async function connectionOptions(host) {
  const options = {
    host: host.host,
    port: host.port || 22,
    username: host.user || 'root',
    readyTimeout: 25000,
    keepaliveInterval: 15000,
    keepaliveCountMax: 4,
  }
  if (host.auth?.kind === 'agent') {
    if (process.env.SSH_AUTH_SOCK) options.agent = process.env.SSH_AUTH_SOCK
  } else if (host.auth?.kind === 'password') {
    const ref = host.auth.passwordRef || `DSH_VPS_${host.id.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_PASSWORD`
    const secret = await resolveSecret(ref)
    if (!secret) throw new Error(`主机 ${host.id} 使用密码认证，但凭据 ${ref} 未设置（用 DSH 凭据管理器写入，或改成私钥认证）`)
    options.password = secret
  } else {
    const keyPath = expandHome(host.auth?.keyPath) || `${process.env.USERPROFILE || process.env.HOME || ''}/.ssh/id_ed25519`
    if (!existsSync(keyPath)) throw new Error(`主机 ${host.id} 的私钥不存在：${keyPath}`)
    options.privateKey = readFileSync(keyPath)
    const ref = host.auth?.passphraseRef || `DSH_VPS_${host.id.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_PASSPHRASE`
    const passphrase = await resolveSecret(ref)
    if (passphrase) options.passphrase = passphrase
  }
  // `hostVerifier` is a connect() option, not a client property: an unset
  // fingerprint is trusted on first use and pinned; a changed one fails.
  options.hostVerifier = (key) => {
    const actual = fingerprintOf(key)
    const pinned = host.hostKey?.fingerprint
    if (!pinned) {
      pendingFingerprint.set(host.id, actual)
      return true
    }
    return pinned === actual
  }
  return options
}

let pendingFingerprint = new Map()

/**
 * Open one TCP-wrapped SSH connection. Rejects on timeout, failure, or abort.
 * Host keys follow trust-on-first-use: an unset fingerprint is pinned, and a
 * changed fingerprint fails the connection.
 */
async function openConnection(host, signal) {
  const options = await connectionOptions(host)
  return new Promise((resolve, reject) => {
    const client = new Client()
    let settled = false
    const finish = (error, value) => {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', onAbort)
      if (error) {
        try {
          client.end()
        } catch {}
        reject(error)
        return
      }
      resolve(value)
    }
    const onAbort = () => finish(new Error('连接已取消'))
    signal?.addEventListener('abort', onAbort, { once: true })
    client.on('ready', () => finish(undefined, client))
    client.on('error', (error) => finish(new Error(`连接 ${host.id} 失败：${messageOf(error)}`)))
    client.on('close', () => finish(new Error(`连接 ${host.id} 在认证前被关闭`)))
    try {
      client.connect(options)
    } catch (error) {
      finish(new Error(`连接 ${host.id} 失败：${messageOf(error)}`))
    }
  }).then((client) => {
    const pinnedNow = pendingFingerprint.get(host.id)
    if (pinnedNow) {
      pendingFingerprint.delete(host.id)
      try {
        rememberFingerprint(host.id, pinnedNow)
      } catch {}
    }
    live.set(host.id, client)
    const forget = () => {
      if (live.get(host.id) === client) live.delete(host.id)
    }
    client.on('close', forget)
    client.on('end', forget)
    return client
  }).catch((error) => {
    if (host.hostKey?.fingerprint && /host key|verification/i.test(messageOf(error))) {
      throw new Error(`主机 ${host.id} 的主机密钥指纹不匹配，已拒绝连接（可能是中间人，或服务器重装过）`)
    }
    throw error
  })
}

/** Connect to `host` over an already-open stream (jump host forwarding). */
export async function connectOverStream(host, stream, signal) {
  const options = await connectionOptions(host)
  delete options.host
  delete options.port
  options.sock = stream
  return new Promise((resolve, reject) => {
    const client = new Client()
    let settled = false
    const finish = (error, value) => {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', onAbort)
      if (error) {
        try {
          client.end()
        } catch {}
        reject(error)
        return
      }
      resolve(value)
    }
    const onAbort = () => finish(new Error('连接已取消'))
    signal?.addEventListener('abort', onAbort, { once: true })
    client.on('ready', () => finish(undefined, client))
    client.on('error', (error) => finish(new Error(`经跳板连接 ${host.id} 失败：${messageOf(error)}`)))
    client.on('close', () => finish(new Error(`经跳板连接 ${host.id} 在认证前被关闭`)))
    try {
      client.connect(options)
    } catch (error) {
      finish(new Error(`经跳板连接 ${host.id} 失败：${messageOf(error)}`))
    }
  }).then((client) => {
    const pinnedNow = pendingFingerprint.get(host.id)
    if (pinnedNow) {
      pendingFingerprint.delete(host.id)
      try {
        rememberFingerprint(host.id, pinnedNow)
      } catch {}
    }
    live.set(host.id, client)
    const forget = () => {
      if (live.get(host.id) === client) live.delete(host.id)
    }
    client.on('close', forget)
    client.on('end', forget)
    return client
  })
}

/** Open a tunneled connection through one jump host. */
export async function acquireViaJump(jumpHost, target, signal) {
  lastUsed.set(target.id, Date.now())
  const existing = live.get(target.id)
  if (existing) return existing
  const pending = connecting.get(target.id)
  if (pending) return pending
  const attempt = (async () => {
    const jump = await acquire(jumpHost, { signal })
    const stream = await new Promise((resolve, reject) => {
      jump.forwardOut('127.0.0.1', 0, target.host, target.port || 22, (error, value) => {
        if (error) reject(new Error(`跳板 ${jumpHost.id} 转发到 ${target.host}:${target.port || 22} 失败：${messageOf(error)}`))
        else resolve(value)
      })
    })
    try {
      return await connectOverStream(target, stream, signal)
    } catch (error) {
      try {
        stream.destroy()
      } catch {}
      throw error
    }
  })()
    .then((client) => {
      connecting.delete(target.id)
      return client
    })
    .catch((error) => {
      connecting.delete(target.id)
      throw error
    })
  connecting.set(target.id, attempt)
  return attempt
}

/**
 * Measure raw TCP reachability without authenticating: a few short-lived
 * connects to the SSH port. This is the "latency / packet loss" number the
 * panel shows; it is not an ICMP ping and it is not a three-carrier probe.
 * @param {object} host - inventory record
 * @param {{attempts?: number, timeoutMs?: number}} [options]
 * @returns {Promise<{avgMs:number|null, minMs:number|null, maxMs:number|null, jitterMs:number|null, lossPct:number, samples:number[], attempts:number, port:number}>}
 */
export async function measureLatency(host, options = {}) {
  const attempts = Math.max(1, Math.min(Number(options.attempts) || 3, 5))
  const timeoutMs = Math.max(200, Math.min(Number(options.timeoutMs) || 2000, 5000))
  const port = host.port || 22
  const samples = []
  const once = () =>
    new Promise((resolve) => {
      const started = process.hrtime.bigint()
      let settled = false
      const socket = net.connect({ host: host.host, port })
      const finish = (value) => {
        if (settled) return
        settled = true
        try {
          socket.destroy()
        } catch {}
        resolve(value)
      }
      socket.setTimeout(timeoutMs)
      socket.once('connect', () => finish(Number(process.hrtime.bigint() - started) / 1e6))
      socket.once('timeout', () => finish(undefined))
      socket.once('error', () => finish(undefined))
    })
  for (let index = 0; index < attempts; index += 1) {
    const value = await once()
    if (value !== undefined) samples.push(Number(value.toFixed(1)))
  }
  const lossPct = Math.round(((attempts - samples.length) / attempts) * 1000) / 10
  if (!samples.length) {
    return { avgMs: null, minMs: null, maxMs: null, jitterMs: null, lossPct, samples, attempts, port }
  }
  const avg = samples.reduce((sum, value) => sum + value, 0) / samples.length
  return {
    avgMs: Number(avg.toFixed(1)),
    minMs: Math.min(...samples),
    maxMs: Math.max(...samples),
    jitterMs: Number((Math.max(...samples) - Math.min(...samples)).toFixed(1)),
    lossPct,
    samples,
    attempts,
    port,
  }
}

/** Reuse or establish the connection for one host. */export async function acquire(host, { signal } = {}) {
  lastUsed.set(host.id, Date.now())
  const existing = live.get(host.id)
  if (existing) return existing
  const pending = connecting.get(host.id)
  if (pending) return pending
  const attempt = openConnection(host, signal)
    .then((client) => {
      connecting.delete(host.id)
      return client
    })
    .catch((error) => {
      connecting.delete(host.id)
      throw error
    })
  connecting.set(host.id, attempt)
  return attempt
}

/** Drop a cached connection without throwing. */
export function release(hostId) {
  const client = live.get(hostId)
  if (!client) return
  live.delete(hostId)
  try {
    client.end()
  } catch {}
}

/** Close every cached connection; used at plugin disposal. */
export function releaseAll() {
  for (const id of [...live.keys()]) release(id)
  connecting.clear()
  lastUsed.clear()
}

/** Close connections unused for longer than `maxIdleMs`. */
export function sweepIdle(maxIdleMs) {
  const now = Date.now()
  for (const [id, at] of [...lastUsed.entries()]) {
    if (!live.has(id)) {
      lastUsed.delete(id)
      continue
    }
    if (now - at <= maxIdleMs) continue
    release(id)
    lastUsed.delete(id)
  }
}

/** Prefix a command for environment variables supplied by a tool call. */
function withEnv(command, env) {
  if (!env || !Object.keys(env).length) return command
  const prefix = Object.entries(env)
    .map(([key, value]) => `${key}=${JSON.stringify(String(value))}`)
    .join(' ')
  return `env ${prefix} sh -lc ${JSON.stringify(command)}`
}

/**
 * Run one command and capture bounded stdout, stderr, and the exit status.
 * @returns {Promise<{exitCode:number|null,signal:string|null,stdout:string,stderr:string,truncated:boolean,timedOut:boolean,durationMs:number}>}
 */
export async function execOn(client, command, options = {}) {
  const { timeoutMs = 30000, signal, maxOutputBytes = 65536, env, stdin } = options
  const started = Date.now()
  return new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    let captured = 0
    let truncated = false
    let timedOut = false
    let timer
    let forceTimer
    let done = false
    const append = (chunk, target) => {
      const text = chunk.toString('utf8')
      const room = maxOutputBytes - captured
      if (room <= 0) {
        truncated = true
        return
      }
      const slice = text.length > room ? text.slice(0, room) : text
      if (slice.length < text.length) truncated = true
      captured += slice.length
      if (target === 'out') stdout += slice
      else stderr += slice
    }
    const settle = (error, value) => {
      if (done) return
      done = true
      clearTimeout(timer)
      clearTimeout(forceTimer)
      signal?.removeEventListener('abort', onAbort)
      if (error) reject(error)
      else resolve(value)
    }
    const onAbort = () => settle(new Error('命令已取消'))
    signal?.addEventListener('abort', onAbort, { once: true })
    client.exec(withEnv(command, env), (error, stream) => {
      if (error) {
        settle(new Error(`执行失败：${messageOf(error)}`))
        return
      }
      timer = setTimeout(() => {
        timedOut = true
        try {
          stream.signal('INT')
        } catch {}
        forceTimer = setTimeout(() => {
          try {
            stream.close()
          } catch {}
          settle(undefined, { exitCode: null, signal: 'SIGINT', stdout, stderr, truncated, timedOut, durationMs: Date.now() - started })
        }, 2000)
      }, timeoutMs)
      stream.on('data', (chunk) => append(chunk, 'out'))
      stream.stderr.on('data', (chunk) => append(chunk, 'err'))
      stream.on('close', (code, signalName) => {
        settle(undefined, {
          exitCode: typeof code === 'number' ? code : null,
          signal: signalName || null,
          stdout,
          stderr,
          truncated,
          timedOut,
          durationMs: Date.now() - started,
        })
      })
      if (stdin) {
        try {
          stream.write(stdin)
        } catch {}
      }
      try {
        stream.end()
      } catch {}
    })
  })
}

/** Open one SFTP session. */
export function openSftp(client) {
  return new Promise((resolve, reject) => {
    client.sftp((error, sftp) => {
      if (error) reject(new Error(`打开 SFTP 失败：${messageOf(error)}`))
      else resolve(sftp)
    })
  })
}

/** Upload one local file to the remote host. */
export function uploadFile(sftp, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    sftp.fastPut(localPath, remotePath, (error) => {
      if (error) reject(new Error(`上传失败：${messageOf(error)}`))
      else resolve({ bytes: 0, durationMs: Date.now() - started })
    })
  })
}

/** Download one remote file to the local path. */
export function downloadFile(sftp, remotePath, localPath) {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    sftp.fastGet(remotePath, localPath, (error) => {
      if (error) reject(new Error(`下载失败：${messageOf(error)}`))
      else resolve({ bytes: 0, durationMs: Date.now() - started })
    })
  })
}

/** List one remote directory. */
export function listDir(sftp, remotePath) {
  return new Promise((resolve, reject) => {
    sftp.readdir(remotePath, (error, entries) => {
      if (error) {
        reject(new Error(`列目录失败：${messageOf(error)}`))
        return
      }
      resolve(
        entries.map((entry) => ({
          name: entry.filename,
          size: entry.attrs.size,
          mode: entry.attrs.mode,
          isDirectory: (entry.attrs.mode & 0o040000) === 0o040000,
          mtime: entry.attrs.mtime,
        })),
      )
    })
  })
}

/** Rename or move one remote path. */
export function renamePath(sftp, from, to) {
  return new Promise((resolve, reject) => {
    sftp.rename(from, to, (error) => {
      if (error) reject(new Error(`改名失败：${messageOf(error)}`))
      else resolve({ from, to })
    })
  })
}

/** Delete one file, or one empty directory. */
export function removePath(sftp, target) {
  return new Promise((resolve, reject) => {
    sftp.stat(target, (error, stats) => {
      if (error) {
        reject(new Error(`读取 ${target} 失败：${messageOf(error)}`))
        return
      }
      const isDirectory = (stats.mode & 0o040000) === 0o040000
      const done = (failure) => (failure ? reject(new Error(`删除失败：${messageOf(failure)}`)) : resolve({ target, directory: isDirectory }))
      if (isDirectory) sftp.rmdir(target, done)
      else sftp.unlink(target, done)
    })
  })
}

/** Change one remote path's permission bits. */
export function chmodPath(sftp, target, mode) {
  return new Promise((resolve, reject) => {
    sftp.chmod(target, mode, (error) => {
      if (error) reject(new Error(`改权限失败：${messageOf(error)}`))
      else resolve({ target, mode })
    })
  })
}

/** Read a remote text file, bounded by the caller's byte cap. */
export function readRemoteFile(sftp, remotePath, maxBytes = 65536) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let total = 0
    const stream = sftp.createReadStream(remotePath, { start: 0, end: maxBytes - 1 })
    stream.on('data', (chunk) => {
      chunks.push(chunk)
      total += chunk.length
    })
    stream.on('error', (error) => reject(new Error(`读取失败：${messageOf(error)}`)))
    stream.on('end', () => resolve({ text: Buffer.concat(chunks).toString('utf8'), bytes: total }))
  })
}

/** Write text to a remote file. */
export function writeRemoteFile(sftp, remotePath, text) {
  return new Promise((resolve, reject) => {
    const stream = sftp.createWriteStream(remotePath)
    stream.on('error', (error) => reject(new Error(`写入失败：${messageOf(error)}`)))
    stream.on('close', () => resolve({ bytes: Buffer.byteLength(text) }))
    stream.end(text)
  })
}

/**
 * Start a local (or SOCKS) listener that forwards through an SSH client.
 * @param {object} options
 * @param {'local'|'dynamic'} options.kind
 * @param {string} options.localHost
 * @param {number} options.localPort
 * @param {string} [options.remoteHost]
 * @param {number} [options.remotePort]
 */
export function startLocalForward(client, options) {
  return new Promise((resolve, reject) => {
    const server = net.createServer((socket) => {
      if (options.kind === 'dynamic') {
        handleSocks(client, socket)
        return
      }
      client.forwardOut(socket.remoteAddress || '127.0.0.1', socket.remotePort || 0, options.remoteHost, options.remotePort, (error, stream) => {
        if (error) {
          socket.destroy()
          return
        }
        socket.pipe(stream).pipe(socket)
        stream.on('error', () => socket.destroy())
        socket.on('error', () => stream.destroy())
      })
    })
    server.on('error', (error) => reject(new Error(`监听 ${options.localHost}:${options.localPort} 失败：${messageOf(error)}`)))
    server.listen(options.localPort, options.localHost, () => resolve(server))
  })
}

/** Minimal SOCKS5 greeting and CONNECT handling over one accepted socket. */
function handleSocks(client, socket) {
  let stage = 'greeting'
  socket.on('error', () => socket.destroy())
  const fail = () => {
    try {
      socket.destroy()
    } catch {}
  }
  socket.on('data', function onData(chunk) {
    if (stage === 'greeting') {
      if (chunk[0] !== 0x05) return fail()
      socket.write(Buffer.from([0x05, 0x00]))
      stage = 'request'
      return
    }
    if (stage !== 'request') return
    if (chunk[0] !== 0x05 || chunk[1] !== 0x01) return fail()
    const addressType = chunk[3]
    let offset = 4
    let host
    if (addressType === 0x01) {
      host = `${chunk[4]}.${chunk[5]}.${chunk[6]}.${chunk[7]}`
      offset = 8
    } else if (addressType === 0x03) {
      const length = chunk[4]
      host = chunk.subarray(5, 5 + length).toString('utf8')
      offset = 5 + length
    } else if (addressType === 0x04) {
      const parts = []
      for (let index = 0; index < 8; index += 1) parts.push(chunk.readUInt16BE(4 + index * 2).toString(16))
      host = parts.join(':')
      offset = 20
    } else {
      return fail()
    }
    const port = chunk.readUInt16BE(offset)
    socket.removeListener('data', onData)
    stage = 'connected'
    client.forwardOut('127.0.0.1', 0, host, port, (error, stream) => {
      if (error) {
        socket.write(Buffer.from([0x05, 0x01, 0x00, 0x01, 0, 0, 0, 0, 0, 0]))
        return fail()
      }
      socket.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]))
      socket.pipe(stream).pipe(socket)
      stream.on('error', () => socket.destroy())
      socket.on('error', () => stream.destroy())
    })
  })
}

/** Ask the server to listen remotely and forward accepted connections locally. */
export function startRemoteForward(client, options) {
  return new Promise((resolve, reject) => {
    client.forwardIn(options.remoteHost, options.remotePort, (error) => {
      if (error) {
        reject(new Error(`远端监听 ${options.remoteHost}:${options.remotePort} 失败：${messageOf(error)}`))
        return
      }
      const onConnection = (info, accept) => {
        const channel = accept()
        const socket = net.connect(options.localPort, options.localHost || '127.0.0.1', () => {
          channel.pipe(socket).pipe(channel)
        })
        socket.on('error', () => channel.destroy())
        channel.on('error', () => socket.destroy())
      }
      client.on('tcp connection', onConnection)
      resolve({
        stop: () => {
          client.removeListener('tcp connection', onConnection)
          try {
            client.unforwardIn(options.remoteHost, options.remotePort, () => {})
          } catch {}
        },
      })
    })
  })
}
