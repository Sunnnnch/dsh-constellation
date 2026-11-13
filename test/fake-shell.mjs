/**
 * Deterministic stand-in for a remote shell. Real SSH transport, simulated
 * commands: the DSH sandbox forbids child processes with piped stdio, so a
 * test server cannot shell out to a real bash.
 */
export const probeSample = [
  '@@OS',
  'PRETTY_NAME="Ubuntu 24.04.1 LTS"',
  'NAME="Ubuntu"',
  'VERSION_ID="24.04"',
  '@@UNAME',
  'Linux 6.8.0-45-generic x86_64',
  '@@UPTIME',
  '186400.55 1000.00',
  '@@LOAD',
  '0.42 0.31 0.22 1/234 5678',
  '@@CORES',
  '4',
  '@@MEM',
  'MemTotal:        3948656 kB',
  'MemFree:          402944 kB',
  'MemAvailable:    2850000 kB',
  '@@DISK',
  'Filesystem     1024-blocks    Used Available Capacity Mounted on',
  '/dev/vda1         41020632 8212345  30691703      22% /',
  '@@NET',
  'Inter-|   Receive                                                |  Transmit',
  ' face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed',
  '    lo:  120000    1200    0    0    0     0          0         0   120000    1200    0    0    0     0       0          0',
  '  eth0: 900000000  700000    0    0    0     0          0         0 400000000  500000    0    0    0     0       0          0',
  '@@FAILED',
  'nginx.service loaded failed failed A high performance web server',
  '@@DOCKER',
  '3',
  '@@END',
].join('\n')

/** Evaluate the handful of commands the assertions use. */
export function fakeShell(command) {
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
    if (piece === 'whoami' || piece === '/usr/bin/whoami') {
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
