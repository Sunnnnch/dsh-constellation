/**
 * Long-running fake SSH server for verifying the installed plugin inside a real
 * DSH host. It speaks the SSH protocol for real (ssh2), so auth, channels, exec,
 * pty, and tcpip forwarding are exercised; only the command interpreter is
 * simulated, because the DSH sandbox forbids child processes with piped stdio.
 *
 * usage: node test/fake-ssh-server.mjs [port]
 */
import ssh2 from 'ssh2'
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import { attachSftp } from './sftp-memory.mjs'

const { Server } = ssh2
const PORT = Number(process.argv[2]) || 2222
const HOST_KEY = new URL('./keys/host_ed25519', import.meta.url).pathname.replace(/^\//, '')

// Generate a throwaway host key on first run; keys are never committed.
mkdirSync(new URL('./keys/', import.meta.url).pathname.replace(/^\//, ''), { recursive: true })
if (!existsSync(HOST_KEY)) {
  const pair = ssh2.utils.generateKeyPairSync('ed25519')
  writeFileSync(HOST_KEY, pair.private)
  writeFileSync(`${HOST_KEY}.pub`, pair.public)
}

const probeSample = [
  '@@OS',
  'PRETTY_NAME="Ubuntu 24.04.1 LTS"',
  'VERSION_ID="24.04"',
  '@@UNAME',
  'Linux 6.8.0-45-generic x86_64',
  '@@UPTIME',
  '186400.55 1000.00',
  '@@LOAD',
  '1.87 0.94 0.61 2/345 9012',
  '@@CORES',
  '8',
  '@@MEM',
  'MemTotal:        8038656 kB',
  'MemFree:         1202944 kB',
  'MemAvailable:    3210000 kB',
  '@@DISK',
  'Filesystem     1024-blocks     Used Available Capacity Mounted on',
  '/dev/vda1         82020632 60123456  17718976      78% /',
  '/dev/vdb1        205113348  5212345 189435317       3% /data',
  '@@NET',
  'Inter-|   Receive                                                |  Transmit',
  ' face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed',
  '    lo:  120000    1200    0    0    0     0          0         0   120000    1200    0    0    0     0       0          0',
  '  eth0: 9437184000 7000000    0    0    0     0          0         0 4000000000 5000000    0    0    0     0       0          0',
  '@@FAILED',
  'nginx.service loaded failed failed A high performance web server',
  '@@DOCKER',
  '5',
  '@@END',
].join('\n')

/** Deterministic stand-in for a remote shell. */
function fakeShell(command) {
  if (command.includes('@@OS')) return { stdout: probeSample, stderr: '', code: 0 }
  let stdout = ''
  let stderr = ''
  let code = 0
  for (const piece of command.split('&&').map((part) => part.trim())) {
    const echoErr = /^echo\s+(.+?)\s*>&2\s*;\s*exit\s+(\d+)$/.exec(piece)
    if (echoErr) {
      stderr += `${echoErr[1]}\n`
      code = Number(echoErr[2])
      continue
    }
    const echo = /^echo\s+(.*)$/.exec(piece)
    if (echo) {
      stdout += `${echo[1].replace(/^["']|["']$/g, '')}\n`
      continue
    }
    if (piece === 'whoami') {
      stdout += 'tester\n'
      continue
    }
    if (piece === 'uname -a') {
      stdout += 'Linux fake-vps 6.8.0-45-generic x86_64 GNU/Linux\n'
      continue
    }
    if (piece.startsWith('cd ')) continue
    stderr += `bash: ${piece}: command not found\n`
    code = 127
  }
  return { stdout, stderr, code }
}

const server = new Server({ hostKeys: [readFileSync(HOST_KEY)] }, (client) => {
  client.on('authentication', (ctx) => ctx.accept())
  client.on('session', (accept) => {
    const session = accept()
    session.on('pty', (acceptPty) => acceptPty())
    session.on('window-change', (acceptWindow) => acceptWindow?.())
    session.on('exec', (acceptExec, _reject, info) => {
      const stream = acceptExec()
      const result = fakeShell(info.command)
      if (result.stdout) stream.write(result.stdout)
      if (result.stderr) stream.stderr.write(result.stderr)
      stream.exit(result.code)
      stream.end()
    })
    session.on('shell', (acceptShell) => {
      const stream = acceptShell()
      stream.write('Welcome to fake-vps (Ubuntu 24.04)\r\nTEST$ ')
      let buffer = ''
      stream.on('data', (chunk) => {
        for (const char of chunk.toString('utf8')) {
          if (char === '\r' || char === '\n') {
            const result = fakeShell(buffer.trim())
            stream.write(`\r\n${result.stdout}${result.stderr}TEST$ `)
            buffer = ''
          } else if (char === '\u0003') {
            stream.write('^C\r\nTEST$ ')
            buffer = ''
          } else if (char === '\u007f') {
            buffer = buffer.slice(0, -1)
          } else {
            buffer += char
            stream.write(char)
          }
        }
      })
    })
  })
  client.on('tcpip', (accept, _reject, info) => {
    const stream = accept()
    const socket = net.connect(info.destPort, info.destIP)
    socket.pipe(stream).pipe(socket)
    socket.on('error', () => stream.close())
  })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`fake ssh server listening on 127.0.0.1:${PORT}`)
})
