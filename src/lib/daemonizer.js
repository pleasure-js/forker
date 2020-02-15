import io from 'socket.io-client'
import { defaultConfig as defaultServerConfig } from './default-config.js'
import { DaemonizerServer } from './daemonizer-server.js'

export const daemonizerConfig = {
  daemonServerConnectionTimeout: process.env.DAEMONIZER_TIMEOUT || 30000
}

const spawnDefaultOptions = {
  cwd: process.cwd()
}

const spawnRequiredOptions = {
  detached: true
}

/**
 * @classdec Daemonizer is a process manager that creates an instance to control multiple spawned processes to monitor.
 */

export class Daemonizer {
  constructor (config = {}, serverConfig = {}) {
    this.config = Object.assign({}, daemonizerConfig, config)
    this.serverConfig = Object.assign({}, defaultServerConfig, serverConfig)
    this._startDaemonComm()
  }

  _startDaemonComm () {
    this.io = io(`http://${ this.serverConfig.ip }:${ this.serverConfig.port }`)
  }

  _resolver (resolve, reject, timeout = this.config.daemonServerConnectionTimeout) {
    const to = setTimeout(() => {
      reject(new Error('Timed out.'))
    }, timeout)

    return ({ err, res }) => {
      clearTimeout(to)
      if (err) {
        return reject(new Error(err))
      }

      resolve(res)
    }
  }

  /**
   * Daemonizes a terminal application by sending the request to the running DaemonizerDaemon.
   *
   * @param {String} id - The command to run.
   * @param {SpawnArgs} spawnArgs - List of string arguments.
   * @param {RunningProcessOptions} processOptions - List of string arguments.
   */
  async fork ({ id, spawnArgs, processOptions }) {
    // todo: check if a daemon is running... otherwise, run one?
    if (!DaemonizerServer.isRunning()) {
      DaemonizerServer.start()
    }

    return new Promise((resolve, reject) => {
      this.io.once('started', this._resolver(resolve, reject))
      this.io.emit('start', { id, spawnArgs, processOptions })
    })
  }

  async stop (id) {
    if (!DaemonizerServer.isRunning()) {
      throw new Error(`DaemonizerServer not running.`)
    }

    return new Promise((resolve, reject) => {
      this.io.once('stopped', this._resolver(resolve, reject))
      this.io.emit('stop', { id })
    })
  }

  async status (id) {
    if (!DaemonizerServer.isRunning()) {
      throw new Error(`DaemonizerServer not running.`)
    }

    return new Promise((resolve, reject) => {
      this.io.once('status', this._resolver(resolve, reject))
      this.io.emit('status', { id })
    })
  }
}
