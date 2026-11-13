import * as ssh from './ssh.js'

const DEFAULT_OPTIONS = {
  idleSilenceMs: 450,
  sendTimeoutMs: 30000,
  startupMs: 8000,
  scrollbackLines: 2000,
  maxBytes: 262144,
}

/** Bounded line-oriented scrollback with a byte ceiling. */
class Scrollback {
  constructor(lines, maxBytes) {
    this.lines = []
    this.maxLines = lines
    this.maxBytes = maxBytes
    this.bytes = 0
    this.partial = ''
  }

  /** Append raw PTY text, keeping complete lines. */
  append(text) {
    this.partial += text
    const parts = this.partial.split(/\r?\n/)
    this.partial = parts.pop() ?? ''
    for (const line of parts) {
      const clean = stripAnsi(line)
      this.lines.push(clean)
      this.bytes += clean.length + 1
    }
    while (this.lines.length > this.maxLines || this.bytes > this.maxBytes) {
      const removed = this.lines.shift()
      this.bytes -= (removed?.length ?? 0) + 1
    }
  }

  /** All retained text including the unfinished last line. */
  text() {
    return [...this.lines, this.partial].join('\n')
  }

  /** Newest-relative page. */
  page(offset = 0, count = 200) {
    const all = [...this.lines, this.partial]
    const total = all.length
    const end = Math.max(0, total - offset)
    const begin = Math.max(0, end - count)
    return { text: all.slice(begin, end).join('\n'), totalLines: total, lineBegin: total - end, lineEnd: total - begin, truncated: begin > 0 }
  }
}

/** Remove ANSI escape sequences from captured output. */
export function stripAnsi(value) {
  return String(value).replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/\u001b\][^\u0007]*\u0007/g, '').replace(/\r/g, '')
}

/**
 * One backend session that owns an SSH shell channel.
 * Implements the `TerminalBackendSession` contract from `@deepseek-ai/dsh-terminal`.
 */
export class SshTerminalSession {
  constructor(client, stream, options) {
    this.client = client
    this.stream = stream
    this.options = { ...DEFAULT_OPTIONS, ...options }
    this.scrollback = new Scrollback(this.options.scrollbackLines, this.options.maxBytes)
    this.pendingSend = undefined
    this.exited = false
    this.exitCode = null
    this.ready = false
    this.motd = ''
    this.startedAt = Date.now()
    stream.on('data', (chunk) => this.onData(chunk))
    stream.stderr.on('data', (chunk) => this.onData(chunk))
    stream.on('close', () => this.onExit())
    stream.on('error', () => this.onExit())
  }

  /** Feed output into scrollback, the active send buffer, and the startup wait. */
  onData(chunk) {
    const text = chunk.toString('utf8')
    this.scrollback.append(text)
    if (!this.ready) {
      this.ready = true
      this.motd = stripAnsi(this.scrollback.text()).trim().slice(-4000)
    }
    const send = this.pendingSend
    if (send && !send.settled) {
      send.buffer += text
      clearTimeout(send.silenceTimer)
      send.silenceTimer = setTimeout(() => this.settleSend('inferred_idle'), this.options.idleSilenceMs)
    }
  }

  /** Mark the session as exited and settle any waiting send. */
  onExit() {
    if (this.exited) return
    this.exited = true
    this.settleSend('session_exit')
  }

  /** Resolve the active send exactly once. */
  settleSend(reason) {
    const send = this.pendingSend
    if (!send || send.settled) return
    send.settled = true
    clearTimeout(send.silenceTimer)
    clearTimeout(send.deadline)
    const result = {
      viewport: stripAnsi(send.buffer),
      waitReason: this.exited ? 'session_exit' : reason,
      sessionStatus: this.status(),
      truncated: false,
    }
    send.resolve(result)
    if (this.pendingSend === send) this.pendingSend = undefined
  }

  /** Wait until the shell produces its first output or the startup window closes. */
  async awaitReady() {
    const deadline = Date.now() + this.options.startupMs
    while (!this.ready && !this.exited && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    return this.motd
  }

  /** Contract: one exclusive send at a time, settling on output silence. */
  startSend(request) {
    if (this.exited) {
      return {
        done: Promise.resolve({ viewport: '', waitReason: 'session_exit', sessionStatus: this.status(), truncated: false }),
        readOutput: () => ({ delta: '', truncated: false }),
        cancel: () => false,
      }
    }
    const send = { buffer: '', settled: false, silenceTimer: undefined, deadline: undefined }
    send.done = new Promise((resolve) => {
      send.resolve = resolve
    })
    this.pendingSend = send
    const text = request.text ?? ''
    this.stream.write(request.submit ? `${text}\n` : text)
    send.silenceTimer = setTimeout(() => this.settleSend('inferred_idle'), this.options.idleSilenceMs)
    send.deadline = setTimeout(() => this.settleSend('timeout'), this.options.sendTimeoutMs)
    if (request.signal) {
      const onAbort = () => {
        try {
          this.stream.write('\u0003')
        } catch {}
        this.settleSend('stdin_read')
      }
      request.signal.addEventListener('abort', onAbort, { once: true })
      send.done.finally(() => request.signal.removeEventListener('abort', onAbort))
    }
    return {
      done: send.done,
      readOutput: () => {
        const delta = stripAnsi(send.buffer)
        send.buffer = ''
        return { delta, truncated: false }
      },
      cancel: () => {
        if (send.settled) return false
        try {
          this.stream.write('\u0003')
        } catch {}
        this.settleSend('stdin_read')
        return true
      },
    }
  }

  /** Contract: bounded backward scrollback page. */
  read(request = {}) {
    return this.scrollback.page(request.offset ?? 0, request.count ?? 200)
  }

  /** Contract: deliver an INT-equivalent control byte; SSH has no pgid signal. */
  async signal(signal) {
    const byte = signal === 'SIGINT' ? '\u0003' : signal === 'SIGTSTP' ? '\u001a' : signal === 'SIGTERM' || signal === 'SIGKILL' ? '\u0004' : '\u0003'
    if (this.exited) throw new Error('会话已结束，无法发送信号')
    this.stream.write(byte)
    return { delivered: true, targetPgid: 0 }
  }

  /** Contract: current top-level status. */
  status() {
    if (this.exited) return { kind: 'exited', exitCode: this.exitCode, signal: null }
    return { kind: 'running' }
  }

  /** Contract: close the channel and drop the connection when it is the last user. */
  async close() {
    this.exited = true
    this.settleSend('session_exit')
    try {
      this.stream.end()
    } catch {}
    try {
      this.stream.close()
    } catch {}
  }
}

/**
 * Register one backend per inventory host, exposing type `ssh:<id>`.
 * The returned disposer unregisters them all.
 */
export function registerTerminalBackends(terminals, service, config = {}) {
  const disposers = []
  const registered = new Set()
  const sync = () => {
    for (const host of service.hosts()) {
      const type = `ssh:${host.id}`
      if (registered.has(type)) continue
      registered.add(type)
      disposers.push(
        terminals.registerBackend({
          type,
          async spawn(spec) {
            const target = spec.name && service.hosts().some((entry) => entry.id === spec.name) ? spec.name : host.id
            const { client } = await service.connect(target, spec.signal)
            const stream = await new Promise((resolve, reject) => {
              client.shell({ term: 'xterm-256color', cols: 120, rows: 32 }, (error, channel) => {
                if (error) reject(new Error(`打开 SSH 会话失败：${error.message}`))
                else resolve(channel)
              })
            })
            const session = new SshTerminalSession(client, stream, config)
            await session.awaitReady()
            return session
          },
        }),
      )
    }
  }
  sync()
  return () => {
    for (const dispose of disposers.splice(0)) {
      try {
        dispose()
      } catch {}
    }
    registered.clear()
  }
}
