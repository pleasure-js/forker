const path = require('path')
const { Daemonizer } = require('../')

const Papo = new Daemonizer()

Papo
  .fork({
    id: `papo`,
    spawnArgs: {
      command: 'pls',
      args: ['app', 'start'],
      options: {
        cwd: path.join(__dirname, '../../pleasure-dummy-vue-project'),
      }
    }
  })
  .then((...args) => {
    console.log(`args>>>`, args)
  })
  .catch(err => {
    console.log(`error: `, err)
  })
