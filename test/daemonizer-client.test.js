import { DaemonizerClient } from '../dist/daemonizer-client.esm.js'
import { DaemonizerServer } from '../dist/daemonizer.esm.js'
import test from 'ava'

let server
let client

test.before(async () => {
  server = new DaemonizerServer()
  client = DaemonizerClient.instance()
  return new Promise(resolve => {
    server.on('ready', resolve)
  })
})

test(`Executes methods in class via socket.io`, async t => {
  server.customMethod = async payload => {
    t.truthy(payload)
    t.is(payload.myPayload, 'yes')
    return { someData: 'juhm' }
  }
  const data = await client.customMethod({ myPayload: 'yes' })
  t.truthy(data)
  t.is(data.someData, 'juhm')
})

test(`Throws error via socket.io`, async t => {
  server.customMethod = async () => {
    throw new Error(`invalid!`)
  }

  const error = await t.throwsAsync(() => client.customMethod())
  t.truthy(error)
  t.is(error.message, 'invalid!')
})
