import { readFileSync, writeFileSync } from 'node:fs'

const path = 'lib/client.js'
const source = readFileSync(path, 'utf8')
const startMarker = '    /** Read-only view of configured Komari / Nezha deployments. */'
const endMarker = '    /** Credential key names a host derives from its id'
const start = source.indexOf(startMarker)
const end = source.indexOf(endMarker)
if (start < 0 || end < 0 || end <= start) {
  console.error('markers', start, end)
  process.exit(1)
}
const snippet = readFileSync('scripts/monitors-dialog.snippet.js', 'utf8')
writeFileSync(path, source.slice(0, start) + snippet + source.slice(end), 'utf8')
console.log('replaced monitors dialog:', end - start, '->', snippet.length)
