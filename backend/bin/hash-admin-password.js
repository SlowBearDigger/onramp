#!/usr/bin/env node
// usage:
//   echo -n 'mySecret123!' | node bin/hash-admin-password.js
//   node bin/hash-admin-password.js   (then type, hidden, then ctrl-D)
//
// prints the scrypt-encoded hash to stdout. paste it into ADMIN_PASSWORD_HASH
// in backend/.env. minimum length is 12 chars.

import { hashPassword } from '../admin/auth.js'
import readline from 'node:readline'

async function readStdin() {
  if (!process.stdin.isTTY) {
    // piped: read raw, strip trailing newline.
    const chunks = []
    for await (const chunk of process.stdin) chunks.push(chunk)
    return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '')
  }
  // tty: prompt with hidden input (no native echo-off without external deps,
  // so warn the user that the password will be visible).
  process.stderr.write(
    'Enter admin password (visible — pipe via echo to hide): '
  )
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr })
  const line = await new Promise((resolve) => rl.question('', resolve))
  rl.close()
  return line
}

async function main() {
  const password = await readStdin()
  if (!password) {
    process.stderr.write('error: empty password\n')
    process.exit(1)
  }
  try {
    const hash = hashPassword(password)
    process.stdout.write(hash + '\n')
  } catch (err) {
    process.stderr.write(`error: ${err.message}\n`)
    process.exit(1)
  }
}

main()
