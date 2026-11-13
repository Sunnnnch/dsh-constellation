/**
 * Build `lib/client.terminal.js`, the lazily-loaded terminal chunk.
 *
 * The chunk inlines xterm's UMD build (MIT) and the fit addon, then the
 * terminal body from `terminal-body.part.js`. It is committed because the
 * plugin ships plain JavaScript with no build step at install time.
 *
 * usage: node scripts/build-terminal-chunk.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'

const root = new URL('..', import.meta.url)
const read = (relative) => readFileSync(new URL(relative, root), 'utf8')

const xterm = read('node_modules/@xterm/xterm/lib/xterm.js')
const fit = read('node_modules/@xterm/addon-fit/lib/addon-fit.js')
const body = read('scripts/terminal-body.part.js')

const chunk = `window.__ModuleLoader__.load({
  id: '@sunrise/dsh-vps',
  chunk: 'client.terminal.js',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    const react = require('react')
    const el = react.createElement
    const { useState, useEffect, useRef } = react

    const TERM_PATH = '/api/vps.term'.slice(1)

    /** One JSON RPC round-trip against the plugin's host routes. */
    async function rpc(body) {
      const response = await fetch('/api/vps.rpc'.slice(1), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!response.ok) throw new Error('HTTP ' + response.status)
      const payload = await response.json()
      if (!payload.ok) throw new Error(payload.error || 'request failed')
      return payload
    }

    // xterm's UMD build, evaluated against a private module object so the
    // chunk keeps its own copy instead of touching globals.
    const xtermModule = (() => {
      const mod = { exports: {} }
      ;(function (module, exports) {
${xterm}
      }).call(globalThis, mod, mod.exports)
      return mod.exports
    })()
    const Terminal = xtermModule.Terminal || (xtermModule.default && xtermModule.default.Terminal)

    const fitModule = (() => {
      const mod = { exports: {} }
      ;(function (module, exports) {
${fit}
      }).call(globalThis, mod, mod.exports)
      return mod.exports
    })()
    const FitAddon = fitModule.FitAddon || (fitModule.default && fitModule.default.FitAddon)

    if (typeof Terminal !== 'function') throw new Error('dsh-vps: xterm 未能加载')
    if (typeof FitAddon !== 'function') throw new Error('dsh-vps: xterm fit addon 未能加载')

${body}

    exports.TerminalBody = TerminalBody
    return module.exports
  },
})
`

const target = new URL('packages/dsh-vps/lib/client.terminal.js', root)
writeFileSync(target, chunk, 'utf8')
console.log(`wrote ${target.pathname} (${(chunk.length / 1024).toFixed(0)} KiB)`)
