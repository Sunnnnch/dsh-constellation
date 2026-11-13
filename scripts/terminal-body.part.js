/**
 * Terminal body compiled into the lazily-loaded `client.terminal.js` chunk.
 *
 * This file is not a module: the chunk builder pastes it inside a factory that
 * already provides `react`, `el`, `rpc`, `Terminal` and `FitAddon`.
 */

/** Real terminal emulation (xterm) over the plugin's SSE + input channel. */
function TerminalBody({ host }) {
  const mountRef = useRef(undefined)
  const termRef = useRef(undefined)
  const sessionRef = useRef(undefined)
  const sourceRef = useRef(undefined)
  const [error, setError] = useState(undefined)
  const [status, setStatus] = useState('connecting')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let disposed = false
    const term = new Terminal({
      fontFamily: 'ui-monospace, Consolas, "Cascadia Mono", monospace',
      fontSize: 12.5,
      lineHeight: 1.15,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 8000,
      convertEol: false,
      allowTransparency: false,
      theme: {
        background: '#0b0c0e',
        foreground: '#e4e6eb',
        cursor: '#e4e6eb',
        selectionBackground: 'rgba(120,160,255,.35)',
        black: '#1c1f24',
        red: '#e05555',
        green: '#35c26b',
        yellow: '#e0a24a',
        blue: '#4a8cff',
        magenta: '#b06aff',
        cyan: '#3fb6c8',
        white: '#d6d6d6',
      },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(mountRef.current)
    termRef.current = term
    try {
      fit.fit()
    } catch {}

    // Keystrokes are coalesced so a fast typist does not issue one request per
    // character; 25 ms is below the perceptible echo delay.
    let pendingInput = ''
    let flushTimer
    const flushInput = () => {
      flushTimer = undefined
      const text = pendingInput
      pendingInput = ''
      const id = sessionRef.current
      if (id && text) rpc({ op: 'termWrite', id, text }).catch(() => {})
    }
    const send = (data) => {
      pendingInput += data
      if (!flushTimer) flushTimer = setTimeout(flushInput, 25)
    }
    const dataDisposable = term.onData(send)
    const resizeDisposable = term.onResize(({ cols, rows }) => {
      const id = sessionRef.current
      if (id) rpc({ op: 'termResize', id, cols, rows }).catch(() => {})
    })

    let lastSeq = 0
    let retries = 0
    let retryTimer
    const connectStream = (id) => {
      const source = new EventSource(`${TERM_PATH}?id=${encodeURIComponent(id)}&since=${lastSeq}`)
      sourceRef.current = source
      source.onmessage = (event) => {
        let frame
        try {
          frame = JSON.parse(event.data)
        } catch {
          return
        }
        if (typeof frame.seq === 'number') lastSeq = frame.seq
        if (frame.text) term.write(frame.text)
      }
      source.onerror = () => {
        try {
          source.close()
        } catch {}
        if (disposed || retries >= 5) {
          setStatus('closed')
          return
        }
        retries += 1
        setStatus('closed')
        retryTimer = setTimeout(() => {
          retryTimer = undefined
          if (!disposed) connectStream(id)
        }, 1000 * retries)
      }
    }

    const connect = async () => {
      try {
        const payload = await rpc({ op: 'termOpen', host, options: { cols: term.cols, rows: term.rows } })
        if (disposed) {
          rpc({ op: 'termClose', id: payload.terminal.id }).catch(() => {})
          return
        }
        sessionRef.current = payload.terminal.id
        retries = 0
        lastSeq = 0
        setStatus('open')
        connectStream(payload.terminal.id)
      } catch (err) {
        if (!disposed) {
          setError(err.message)
          setStatus('error')
        }
      }
    }
    connect()

    const observer = new ResizeObserver(() => {
      try {
        fit.fit()
      } catch {}
    })
    if (mountRef.current) observer.observe(mountRef.current)
    term.focus()

    return () => {
      disposed = true
      observer.disconnect()
      if (retryTimer) clearTimeout(retryTimer)
      if (flushTimer) clearTimeout(flushTimer)
      pendingInput = ''
      try {
        if (sourceRef.current) sourceRef.current.close()
      } catch {}
      sourceRef.current = undefined
      const id = sessionRef.current
      sessionRef.current = undefined
      if (id) rpc({ op: 'termClose', id }).catch(() => {})
      dataDisposable.dispose()
      resizeDisposable.dispose()
      term.dispose()
      termRef.current = undefined
    }
  }, [host, attempt])

  return el(
    'div',
    { style: { display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minHeight: 0 } },
    el(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 } },
      el('span', { style: { color: status === 'open' ? '#35c26b' : status === 'error' ? '#e05555' : '#8a8f98' } },
        status === 'open' ? '● 已连接' : status === 'error' ? '● 连接失败' : status === 'closed' ? '● 已断开' : '● 连接中…'),
      el('span', { style: { color: '#8a8f98' } }, '支持 vim / htop / tmux'),
      el('span', { style: { flex: 1 } }),
      el('button', { style: buttonStyle(false), onClick: () => setAttempt((value) => value + 1) }, '重连'),
      el('button', { style: buttonStyle(false), onClick: () => { if (termRef.current) termRef.current.clear() } }, '清屏'),
      el('button', { style: buttonStyle(false), onClick: () => { if (termRef.current) termRef.current.focus() } }, '聚焦'),
    ),
    error ? el('div', { style: { color: '#e05555', fontSize: 11, wordBreak: 'break-word' } }, error) : null,
    el('div', { ref: mountRef, style: { flex: 1, minHeight: 0, background: '#0b0c0e', borderRadius: 8, padding: '6px 8px', overflow: 'hidden' } }),
  )
}

/** Small neutral button used by the terminal header. */
function buttonStyle(primary) {
  return {
    padding: '3px 10px',
    borderRadius: 7,
    cursor: 'pointer',
    fontSize: 11,
    color: '#d6d6d6',
    border: `1px solid ${primary ? 'rgba(255,255,255,.34)' : 'rgba(255,255,255,.18)'}`,
    background: primary ? 'rgba(255,255,255,.12)' : 'transparent',
  }
}
