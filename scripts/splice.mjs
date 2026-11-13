import { readFileSync, writeFileSync } from "node:fs"
const path = "lib/client.js"
const source = readFileSync(path, "utf8")
const start = source.indexOf("    /** Interactive shell over the SSE channel. */")
const end = source.indexOf("    /** Remote directory browser with upload and download. */")
if (start < 0 || end < 0 || end <= start) { console.error("markers not found", start, end); process.exit(1) }
const snippet = readFileSync("scripts/terminal-view.snippet.js", "utf8")
writeFileSync(path, source.slice(0, start) + snippet + source.slice(end), "utf8")
console.log("spliced", end - start, "bytes ->", snippet.length)
