    /** Lazily loaded xterm chunk; the entry stays small until a terminal opens. */
    let LazyTerminalBody
    function getTerminalBody() {
      if (!LazyTerminalBody) {
        if (typeof react.lazy !== 'function' || typeof require.async !== 'function') {
          throw new Error('当前客户端不支持懒加载终端模块')
        }
        LazyTerminalBody = react.lazy(async () => ({ default: (await require.async('./client.terminal.js')).TerminalBody }))
      }
      return LazyTerminalBody
    }

    /** Terminal tab: real xterm emulation, loaded on demand. */
    function TerminalView({ host }) {
      let Body
      try {
        Body = getTerminalBody()
      } catch (err) {
        return el('div', { style: styles.err }, `终端模块不可用：${err.message}`)
      }
      return el(
        react.Suspense,
        { fallback: el('div', { style: { ...styles.muted, padding: 12 } }, '加载终端…') },
        el(Body, { host }),
      )
    }

