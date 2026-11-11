// Runs the API (port 4000) and the Vite client (port 5173) together. Ctrl+C stops both.
import { spawn, spawnSync } from 'node:child_process'

const tasks = [
  { name: 'api', colour: '\x1b[35m', workspace: '@mini-ai/server' },
  { name: 'web', colour: '\x1b[36m', workspace: '@mini-ai/client' },
]
const RESET = '\x1b[0m'
const children = []
let stopping = false

function prefixLines(name, colour, stream, target) {
  let buffer = ''
  stream.setEncoding('utf8')
  stream.on('data', (chunk) => {
    buffer += chunk
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''
    for (const line of lines) target.write(`${colour}[${name}]${RESET} ${line}\n`)
  })
}

function stopAll(code = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) {
    if (child.exitCode !== null) continue
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' })
    } else {
      child.kill('SIGTERM')
    }
  }
  process.exit(code)
}

for (const task of tasks) {
  // One command string (fixed, no user input): needed for npm.cmd on Windows without Node's DEP0190 warning.
  const child = spawn(`npm run dev -w ${task.workspace}`, {
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '1' },
  })
  prefixLines(task.name, task.colour, child.stdout, process.stdout)
  prefixLines(task.name, task.colour, child.stderr, process.stderr)
  child.on('exit', (code) => {
    if (!stopping) {
      console.error(`${task.colour}[${task.name}]${RESET} exited with code ${code}. Stopping.`)
      stopAll(code ?? 1)
    }
  })
  children.push(child)
}

process.on('SIGINT', () => stopAll(0))
process.on('SIGTERM', () => stopAll(0))
