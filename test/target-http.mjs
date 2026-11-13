import http from 'node:http'

const port = Number(process.argv[2]) || 18080
http
  .createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/plain' })
    response.end(`tunnel-target-ok ${request.url}\n`)
  })
  .listen(port, '127.0.0.1', () => console.log(`target http on 127.0.0.1:${port}`))
