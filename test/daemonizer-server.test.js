import { DaemonizerServer } from '../dist/daemonizer.esm.js'
import { driver, socket } from './utils/driver.js'
import test from 'ava'

let server

test.before(() => {
  server = new DaemonizerServer()
  return new Promise((resolve, reject) => {
    server.on('ready', resolve)
  })
})

test.after.always(() => {
  if (!server) {
    return
  }
  server._stopDaemonComm()
})

test(`Listens http on given port`, async t => {
  const error = await t.throwsAsync(() => driver.get('/'))
  t.is(error.message, `Request failed with status code 404`)
})

test(`Triggers actions via http`, async t => {
  const { data: { id, result/*, error*/ } } = await driver.post('/fork?wait', {
    spawnArgs: {
      command: 'ls',
      args: ['-la']
    }
  })
  t.truthy(id)
  t.truthy(result)
})

test(`Listens for socket.io`, async t => {
  return new Promise(resolve => {
    socket.on('connect', resolve)
    t.pass()
  })
})

test(`Executes methods in class via socket.io`, async t => {
  return new Promise(resolve => {
    server.customMethod = payload => {
      t.truthy(payload)
      t.is(payload.myPayload, 'yes')
      resolve()
    }
    socket.emit('exec', { method: 'customMethod', payload: [{ myPayload: 'yes' }] })
  })
})
