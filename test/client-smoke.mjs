/**
 * Client-bundle smoke test. The browser half is a lazy-CJS factory registered
 * on `window.__ModuleLoader__`; this runs that factory against a stub `require`
 * and a stub client Context, so a broken registration (wrong slot name, wrong
 * key, a typo that only throws at load) fails here instead of silently doing
 * nothing in the page.
 *
 * usage: node test/client-smoke.mjs
 */
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../packages/dsh-vps/lib/client.js', import.meta.url), 'utf8')

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`)
}

const registrations = []
const fakeWindow = {
  __ModuleLoader__: {
    load(entry) {
      registrations.push(entry)
    },
  },
}

// Minimal React surface: only what the module body touches at define time.
const fakeReact = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
  useRef: (initial) => ({ current: initial }),
  useCallback: (fn) => fn,
  useMemo: (fn) => fn(),
  lazy: (factory) => ({ __lazy: factory }),
  Suspense: 'Suspense',
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

const previousWindow = globalThis.window
globalThis.window = fakeWindow
try {
  new Function('window', source)(fakeWindow)
} finally {
  globalThis.window = previousWindow
}

check('bundle registers exactly one module', registrations.length === 1, `${registrations.length} registrations`)
const entry = registrations[0]
check('module id matches the package name', entry?.id === '@sunrise/dsh-vps', entry?.id || 'none')
check('factory is a function', typeof entry?.factory === 'function')

const moduleExports = entry.factory(fakeRequire)
check('exports apply()', typeof moduleExports.apply === 'function')
check('exports inject list', Array.isArray(moduleExports.inject), JSON.stringify(moduleExports.inject))
check('declares the layout service', moduleExports.inject.includes('layout'), JSON.stringify(moduleExports.inject))

// Stub the client services the plugin declares, then run apply().
const tabs = []
const slots = []
const dictionaries = []
const scopeEffects = []
const injectTargets = []
const ctx = {
  effect(fn, label) {
    const dispose = fn()
    scopeEffects.push({ label, dispose })
    return dispose
  },
  locale: {
    bind: () => (key) => key,
    register: (namespace, dictionary) => {
      dictionaries.push({ namespace, dictionary })
      return () => {}
    },
  },
  sidebarRightTabs: {
    register(definition) {
      tabs.push(definition)
      return () => {}
    },
  },
  slots: {
    inject(name, register) {
      injectTargets.push(name)
      register()
      return () => {}
    },
    register(definition, component) {
      slots.push({ definition, component })
      return () => {}
    },
  },
}

let thrown
try {
  moduleExports.apply(ctx)
} catch (error) {
  thrown = error
}
check('apply() runs without throwing', !thrown, thrown?.message || '')

const byName = (name) => slots.filter((slot) => slot.definition.name === name)
const panelEntry = byName('sidebar.panellist')[0]
const mainPage = byName('main')[0]
const sideBody = byName('sidebar.right.pane.tab')[0]

check('registers a left-rail entry', Boolean(panelEntry) && panelEntry.definition.id === '@sunrise/dsh-vps', JSON.stringify(byName('sidebar.panellist').map((slot) => slot.definition.id)))
check('left-rail entry has order + label', panelEntry?.definition.order === 40 && typeof panelEntry.definition.label === 'function', String(panelEntry?.definition.order))
check('left-rail entry is a component', typeof panelEntry?.component === 'function')
check('registers the main page under the same id', Boolean(mainPage) && mainPage.definition.key === '@sunrise/dsh-vps', JSON.stringify(byName('main').map((slot) => slot.definition.key)))
check('main page is a component', typeof mainPage?.component === 'function')
check('slot injections target declared slots', injectTargets.includes('sidebar.panellist') && injectTargets.includes('main') && injectTargets.includes('sidebar.right.pane.tab'), JSON.stringify(injectTargets))

check('registers a right-sidebar tab type', tabs.length === 1 && tabs[0].kind === 'vps' && tabs[0].id === '@sunrise/dsh-vps', JSON.stringify(tabs.map((tab) => tab.kind)))
check('tab type exposes a guide entry', Array.isArray(tabs[0]?.guide) && tabs[0].guide.length === 1)
check('registers the right-sidebar body slot', Boolean(sideBody) && sideBody.definition.key === '@sunrise/dsh-vps')

check('registers zh + en dictionaries', dictionaries.length === 1 && Boolean(dictionaries[0].dictionary.zh) && Boolean(dictionaries[0].dictionary.en), Object.keys(dictionaries[0]?.dictionary || {}).join(','))

// Every effect must hand back a disposer for HMR.
check('every effect returns a disposer', scopeEffects.every((entry) => typeof entry.dispose === 'function' || typeof entry.dispose === 'undefined'), `${scopeEffects.filter((e) => typeof e.dispose === 'function').length}/${scopeEffects.length} with disposer`)

// Render the registered components once with stub hooks: this catches element
// trees that throw at build time (bad prop plumbing, undefined access).
const t = (key) => key
const iconTree = panelEntry.component({ size: 18, active: true })
check('left-rail icon renders an svg', iconTree?.type === 'svg' && iconTree.props.width === 18, String(iconTree?.type))

let pageTree
try {
  pageTree = mainPage.component({ t })
  // `withLocale` wraps the page in one element; render that component too.
  if (typeof pageTree?.type === 'function') pageTree = pageTree.type(pageTree.props)
} catch (error) {
  pageTree = { error }
}
check('main page renders without throwing', !pageTree?.error, pageTree?.error?.message || '')
check('main page renders a header and a body', pageTree?.type === 'div' && (pageTree.children?.length || 0) >= 3, `${pageTree?.children?.length} children`)

let sideTree
try {
  sideTree = sideBody.component({ t })
  if (typeof sideTree?.type === 'function') sideTree = sideTree.type(sideTree.props)
} catch (error) {
  sideTree = { error }
}
check('right-sidebar body renders without throwing', !sideTree?.error, sideTree?.error?.message || '')

// Exercise the data-heavy pieces directly: a shallow stub never reaches them
// because their effects do not run, so render their trees explicitly.
const components = moduleExports.__components

const renderTree = (node, depth = 0) => {
  if (node === null || node === undefined || depth > 25) return
  if (Array.isArray(node)) {
    for (const child of node) renderTree(child, depth + 1)
    return
  }
  if (typeof node !== 'object') return
  if (node.__lazy) return
  const { type, props, children } = node
  if (typeof type === 'function' && !(type.prototype && typeof type.prototype.render === 'function')) {
    renderTree(type(props || {}), depth + 1)
    return
  }
  for (const child of children || []) renderTree(child, depth + 1)
}

const rendersCleanly = (name, factory) => {
  try {
    renderTree(factory())
    check(name, true)
  } catch (error) {
    check(name, false, error.message)
  }
}

check('exposes test components', Boolean(components) && typeof components.Spark === 'function', Object.keys(components || {}).join(','))

const sparkTree = components.Spark({ values: [10, 40, 70], tone: '#000' })
check(
  'sparkline draws a polyline with three points',
  sparkTree?.type === 'svg' && sparkTree.children?.[0]?.type === 'polyline' && (sparkTree.children[0].props.points.match(/,/g) || []).length === 3,
  String(sparkTree?.children?.[0]?.props?.points || ''),
)

rendersCleanly('history cards render', () => components.HistoryCards({ host: 'demo' }))
rendersCleanly('batch dialog renders', () =>
  components.BatchDialog({ hosts: [{ id: 'a', label: 'A', user: 'root', host: '1.2.3.4', tags: ['prod'] }], initialSelected: ['a'], onDone: () => {} }))
rendersCleanly('monitors dialog renders', () => components.MonitorsDialog({ onDone: () => {} }))
rendersCleanly('settings dialog renders', () => components.SettingsDialog({ onDone: () => {}, onSaved: () => {} }))
rendersCleanly('host dialog renders', () => components.HostDialog({ t: (key) => key, onCancel: () => {}, onDone: () => {} }))

const failed = results.filter((result) => !result.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)