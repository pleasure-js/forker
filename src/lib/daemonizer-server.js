import { spawn } from 'child_process'
import { RunningProcess } from './running-process.js'
import Table from 'cli-table'
import moment from 'moment'
import http from 'http'
import SocketIO from 'socket.io'
import path from 'path'
import fs from 'fs'
import isRunning from 'is-running'
import { readJsonSync, writeJsonSync } from 'fs-extra'
import { defaultConfig } from './default-config.js'
import pidusage from 'pidusage'
import Promise from 'bluebird'
import filesize from 'filesize'

const pidInfo = Promise.promisify(pidusage)

const spawnDefaultOptions = {
  cwd: process.cwd()
}

const spawnRequiredOptions = {
  detached: true
}

/**
 * @classdec DaemonizerDaemon is the process manager that creates and control multiple spawned processes to monitor.
 */

export class DaemonizerServer {
  constructor (config = {}) {
    this._runningProcesses = []
    this.config = Object.assign({}, defaultConfig, config)
    this._startDaemeonComm()

    // save pid
    writeJsonSync(this.config.runningThread, Object.assign({}, this.config, { pid: process.pid }))
  }

  _startDaemeonComm () {
    const server = http.createServer()
    this._io = SocketIO(server)

    this._io.on('connect', socket => {
      // start a new process
      socket.on('start', (payload) => {
        try {
          socket.emit('started', { res: this.fork(payload).toJSON() })
        } catch (err) {
          socket.emit('started', { err: err.message, payload })
          console.log(`error>>>`, err)
        }
      })

      // stop the process
      socket.on('stop', (payload) => {
        try {
          socket.emit('stopped', { res: this.stop(payload).toJSON() })
        } catch (err) {
          socket.emit('stopped', { err: err.message })
          console.log(`error>>>`, err)
        }
      })

      // status of the process
      socket.on('status', async (payload) => {
        try {
          socket.emit('status', { res: await this.status(payload) })
        } catch (err) {
          socket.emit('status', { err: err.message })
          console.log(`error>>>`, err)
        }
      })
    })

    server.listen(this.config.port, this.config.ip)
  }

  /**
   * Returns a {@link RunningProcess} given an `id`.
   * @param {String} id - SubProcess id (different than pid)
   * @return {RunningProcess|void} The running process
   */
  findProcessById (id) {
    let foundProcess
    if (id) {
      this._runningProcesses.forEach(runningProcess => {
        if (runningProcess.id === id) {
          foundProcess = runningProcess
        }
      })
    }
    return foundProcess
  }

  /**
   * Returns a {@link RunningProcess} given an `id`.
   * @param {String} pid - Process id
   * @return {RunningProcess|void} The running process
   */
  findProcessByPid (pid) {
    let foundProcess
    if (id) {
      this._runningProcesses.forEach(runningProcess => {
        if (runningProcess.pid === pid) {
          foundProcess = runningProcess
        }
      })
    }
    return foundProcess
  }

  _exit (runningProcess) {
    runningProcess.pid && console.log(`Closing process '${ runningProcess.pid }'`)
    const runningProcessIndex = this._runningProcesses.indexOf(runningProcess)
    runningProcess.removeAllListeners()

    if (runningProcessIndex >= 0) {
      this._runningProcesses.splice(runningProcessIndex, 1)
    }

    if (this._runningProcesses.length === 0) {
      setTimeout(() => {
        if (this._runningProcesses.length === 0) {
          console.log(`Closing process manager since no sub-processes are running`)
          process.exit(0)
        }
      }, 1000)
    }
  }

  /**
   * Forks a process & starts monitoring it
   * @param {String} id - Optional identifier for the process. If none if provided, the system will automatically try
   * to guess one.
   * @param {SpawnArgs} spawnArgs
   * @param {RunningProcessOptions} processOptions
   */
  fork ({ id, spawnArgs, processOptions }) {
    const foundProcess = this.findProcessById(id)

    if (foundProcess) {
      return foundProcess
    }

    const runningProcess = new RunningProcess(id, spawnArgs, processOptions)
    const onExit = this._exit.bind(this, runningProcess)

    runningProcess.on('exit', onExit)
    this._runningProcesses.push(runningProcess)

    return runningProcess
  }

  /**
   *
   * @param {String} id
   */
  stop ({ id }) {
    const runningProcess = this.findProcessById(id)
    if (!runningProcess) {
      throw new Error(`Process ${ id } not found.`)
    }

    return runningProcess.stop()
  }

  /**
   *
   * @param {DaemonizerConfig} [config] - Defaults to default config.
   * @return {Number|void} Returns the process id (pid) when the process is running. `void` otherwise.
   */
  static isRunning (config = {}) {
    config = Object.assign({}, defaultConfig, config)
    // console.log({ config })
    if (fs.existsSync(config.runningThread)) {
      const { pid } = readJsonSync(config.runningThread)
      if (isRunning(pid)) {
        return pid
      }
    }
  }

  /**
   *
   * @param {DaemonizerConfig} config - Defaults to default config.
   * @param {Object} env - Environment key-value pairs.
   * @return {Number} The process id (pid).
   * @throws {Error} Throws 'Another process is already running (pid = ${ runningPid })' when a process is already
   * running.
   */
  static start (config = {}, env = {}) {
    config = Object.assign({}, defaultConfig, config)
    const runningPid = DaemonizerServer.isRunning(config)

    if (runningPid) {
      throw new Error(`Another process is already running (pid = ${ runningPid })`)
    }

    const child = spawn(`node`, [__filename, `&>${ path.join(__dirname, '../daemon.log') }`], {
      detached: true,
      stdio: 'ignore',
      env: Object.assign({}, process.env, env, {
        DAEMONIZER_DAEMON_START: true,
        DAEMONIZER_DAEMON_CONFIG: JSON.stringify(config)
      })
    })

    child.unref()
    return child.pid
  }

  async status ({ id }) {
    // connects to main thread via socket
    // gets status
    const processTable = []

    await Promise.each(this._runningProcesses, async (runningProcess) => {
      if (id && runningProcess.id !== id) {
        return
      }

      let cpu = 0
      let memory = 0
      let elapsed = 0
      if (runningProcess.pid) {
        ({ cpu = 0, memory = 0, elapsed = 0 } = await pidInfo(runningProcess.pid))
      }

      processTable.push(Object.assign(runningProcess.toJSON(), {
        cpu: cpu.toFixed(1),
        memory: filesize(memory),
        elapsed: elapsed / 1000
      }))
    })

    return processTable
  }
}

if (process.env.DAEMONIZER_DAEMON_START) {
  new DaemonizerServer()
}
