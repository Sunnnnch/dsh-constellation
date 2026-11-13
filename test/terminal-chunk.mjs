/**
 * Terminal chunk smoke test.
 *
 * The lazily-loaded `client.terminal.js` is plain JavaScript registered on
 * `window.__ModuleLoader__` with `{ id, chunk, factory }`. This evaluates that
 * file the way the browser loader does, then runs its factory with a stub
 * `require` to prove the chunk registers correctly, that the inlined xterm UMD
 * evaluates outside a DOM, and that the factory exports the terminal body.
 *
 * usage: node test/terminal-chunk.mjs
 */
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../packages/dsh-vps/lib/client.terminal.js', import.meta.url), 'utf8')

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`)
}

let entry
const fakeWindow = {
  __ModuleLoader__: {
    load(value) {
      entry = value
    },
  },
}
const previousWindow = globalThis.window
const previousSelf = globalThis.self
try {
  globalThis.window = fakeWindow
  // xterm's UMD tests `self`; the browser provides it, Node does not.
  globalThis.self = globalThis
  new Function('window', source)(fakeWindow)
} finally {
  globalThis.window = previousWindow
  globalThis.self = previousSelf
}

check('chunk registers one module', Boolean(entry), entry ? 'ok' : 'none')
check('chunk id is the owning package', entry?.id === '@sunrise/dsh-vps', entry?.id || 'none')
check('chunk names its file', entry?.chunk === 'client.terminal.js', entry?.chunk || 'none')
check('chunk factory is a function', typeof entry?.factory === 'function')

const fakeReact = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
  useRef: (initial) => ({ current: initial }),
  useCallback: (fn) => fn,
  Component: class {
    constructor(props) {
      this.props = props
      this.state = {}
    }
    setState() {}
  },
}
const fakeRequire = (name) => {
  if (name === 'react') return fakeReact
  throw new Error(`unexpected require(${name})`)
}

let exported
let failure
try {
  exported = entry.factory(fakeRequire)
} catch (error) {
  failure = error
}
check('chunk factory evaluates (xterm UMD runs without a DOM)', !failure, failure?.message || '')
check('exports TerminalBody', typeof exported?.TerminalBody === 'function')

console.log(`\n${results.filter((result) => result.ok).length}/${results.length} passed`)
process.exitCode = results.every((result) => result.ok) ? 0 : 1
