import test from 'ava'
import { DaemonizerClient } from '../dist/daemonizer-client.esm.js'
import { DaemonizerServer } from '../dist/daemonizer.esm.js'
import Promise from 'bluebird'
import path from 'path'

let server
let client

const processes = []

test.before(async () => {
  server = new DaemonizerServer()
  client = DaemonizerClient.instance()
  return new Promise(resolve => {
    server.on('ready', resolve)
  })
})

test.after.always(async () => {
  await Promise.each(processes, async id => {
    await client.stop(id)
  })
})

test(`Daemonizer forks a process`, async t => {
  const res = await client.fork({
    id: 'loop', spawnArgs: {
      command: path.join(__dirname, 'fixtures/forkables/loop.sh')
    }
  })
  t.truthy(res)
  processes.push(res.id)
})

test(`Daemonizer forks a process retrieving progress`, async t => {
  const process = await client.fork({
    id: 'loop2',
    spawnArgs: {
      command: path.join(__dirname, 'fixtures/forkables/loop.sh')
    },
    runningProcessOptions: {
      stdio: ['pipe', 'pipe', 'pipe']
    }
  })
  t.truthy(process)
  processes.push(process.id)
  return new Promise((resolve, reject) => {
    client.io.on(`progress-${ process.id }`, testProgress => {
      t.true(/^loop [\d]+\n$/.test(testProgress))
      t.pass()
      resolve()
    })
    setTimeout(reject, 1000)
  })
})

test(`List processes`, async t => {
  const list = await client.list()
  t.truthy(list)
  t.true(Array.isArray(list))
})
