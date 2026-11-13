/**
 * Run every suite in order and exit non-zero on the first failure.
 *
 * usage: node test/all.mjs
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const suites = ['harness.mjs', 'client-smoke.mjs', 'terminal-chunk.mjs']

let failed = 0
for (const suite of suites) {
  console.log(`\n=== ${suite} ===`)
  const result = spawnSync(process.execPath, [join(here, suite)], { stdio: 'inherit' })
  if (result.status !== 0) {
    failed += 1
    console.error(`\n${suite} failed with status ${result.status}`)
  }
}

if (failed) {
  console.error(`\n${failed}/${suites.length} suites failed`)
  process.exit(1)
}
console.log(`\nall ${suites.length} suites passed`)
