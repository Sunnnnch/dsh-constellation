/**
 * Minimal CommonJS evaluator.
 *
 * The DSH host installs its own module pipeline, and that pipeline shallow-copies
 * a CJS module's exports. A package whose entry *is* a class — `ssh2`'s
 * `lib/client.js` does `module.exports = Client` — loses the constructor that
 * way, because copying a class yields `{}`. Evaluating those files ourselves
 * keeps the real export object; builtins, `.node` addons and JSON still go
 * through Node's own loader.
 */
import { readFileSync, statSync } from 'node:fs'
import { createRequire, isBuiltin } from 'node:module'
import { dirname, extname, isAbsolute, join } from 'node:path'

const realRequire = createRequire(import.meta.url)

/** Resolve a relative request the way Node's CJS resolver does, minus hooks. */
function resolveLocal(base) {
  for (const candidate of [base, `${base}.js`, `${base}.json`, join(base, 'index.js'), join(base, 'index.json')]) {
    try {
      if (statSync(candidate).isFile()) return candidate
    } catch {}
  }
  throw new Error(`dsh-vps: 无法解析本地模块 ${base}`)
}

/**
 * Evaluate one CommonJS file (and its relative tree) without the host's
 * interop wrappers.
 * @param {string} entry - absolute path of the entry file
 * @returns {unknown} the entry's real `module.exports`
 */
export function loadCommonJs(entry) {
  const cache = new Map()

  const load = (filename) => {
    const cached = cache.get(filename)
    if (cached) return cached.exports
    if (extname(filename) === '.json') return JSON.parse(readFileSync(filename, 'utf8'))
    if (extname(filename) === '.node') return realRequire(filename)

    const source = readFileSync(filename, 'utf8')
    const mod = { exports: {}, filename, id: filename, loaded: false }
    cache.set(filename, mod)
    const dir = dirname(filename)
    const localRequire = (specifier) => {
      if (isBuiltin(specifier)) return realRequire(specifier)
      if (specifier.startsWith('.') || isAbsolute(specifier)) return load(resolveLocal(join(dir, specifier)))
      return load(realRequire.resolve(specifier, { paths: [dir] }))
    }
    const factory = new Function(
      'exports',
      'require',
      'module',
      '__filename',
      '__dirname',
      `${source}\n//# sourceURL=${filename.replace(/\\/g, '/')}`,
    )
    factory(mod.exports, localRequire, mod, filename, dir)
    mod.loaded = true
    return mod.exports
  }

  return load(entry)
}
