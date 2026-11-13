import { readFileSync, writeFileSync } from "node:fs"
const path = "packages/dsh-vps/lib/client.js"
const source = readFileSync(path, "utf8")
const startMarker = "    /** Status + latency cards, refreshed while mounted (Komari-style layout). */"
const endMarker = "    /** Lazily loaded xterm chunk"
const start = source.indexOf(startMarker)
const end = source.indexOf(endMarker)
if (start < 0 || end < 0 || end <= start) { console.error("markers", start, end); process.exit(1) }
const snippet = readFileSync("scripts/status-view.snippet.js", "utf8")
writeFileSync(path, source.slice(0, start) + snippet + source.slice(end), "utf8")
console.log("replaced", end - start, "bytes with", snippet.length)
