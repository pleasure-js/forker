import { spawn } from 'child_process'
import { RunningProcess } from './running-process.js'
import Koa from 'koa'
import koaBody from 'koa-body'
import Router from 'koa-router'
import SocketIO from 'socket.io'
import path from 'path'
import fs from 'fs'
import isRunning from 'is-running'
import { readJsonSync, writeJsonSync } from 'fs-extra'
import { defaultConfig } from './default-config.js'
import pidusage from 'pidusage'
import Promise from 'bluebird'
import filesize from 'filesize'
import { EventEmitter } from 'events'
import { RequestSchema } from './request.js'
import { uuid } from './uuid.js'
import castArray from 'lodash/castArray'

const pidInfo = Promise.promisify(pidusage)

const spawnDefaultOptions = {
  cwd: process.cwd()
}

const spawnRequiredOptions = {
  detached: true
}

/**
 * @classdec DaemonizerDaemon is the process manager that creates and control multiple spawned processes.
 */

export class DaemonizerServer extends EventEmitter {
  constructor (config = {}) {
    super()
    this._runningProcesses = []
    this.config = Object.assign({}, defaultConfig, config)
    this._startDaemonComm()

    // save pid
    writeJsonSync(this.config.runningThread, Object.assign({}, this.config, { pid: process.pid }))

    // fork logic
    this.on('request-start', ({ socket, request }) => {
      if (request.command === 'fork') {
        const processId = request.payload[0].id = request.payload[0].id || uuid()
        const progress = (...payload) => { socket.emit(`progress-${ processId }`, ...payload) }

        this.on(`progress-${ processId }`, progress)
        this.once(`request-end-${ processId }`, () => {
          this.off(`progress-${ processId }`, progress)
        })
      }
    })
  }

  /**
   * Starts socket.io for IPC
   * @private
   */
  _startDaemonComm () {
    const router = Router()
    const app = new Koa()

    app.use(koaBody())

    app.use(async (ctx, next) => {
      try {
        await next()
      } catch (err) {
        ctx.body = { error: err.message }
        console.log(err)
      }
    })

    router.post(`/fork`, async ctx => {
      // todo: add jwt auth
      const fork = ctx.request.body

      if (Object.hasOwnProperty.call(ctx.request.query, 'wait')) {
        Object.assign(fork, {
          runningProcessOptions: {
            stdio: ['pipe', 'pipe', 'pipe'],
            autoRestart: false
          }
        })
      }

      const runningProcess = this.fork(fork)
      const { id } = runningProcess

      if (Object.hasOwnProperty.call(ctx.request.query, 'wait')) {
        ctx.body = {
          id,
          ...(await (new Promise((resolve) => {
            runningProcess.on('done', resolve)
          })))
        }
        return
      }

      ctx.body = { id }
    })
    app.use(router.routes())
    this.server = app.listen(this.config.port, this.config.ip, () => {
      this.emit('ready')
    })
    this._io = SocketIO(this.server)

    this._io.on('connect', socket => {
      // start a new process
      socket.on('start', (payload) => {
        try {
          socket.emit('started', { res: this.fork(payload).toJSON() })
        } catch (err) {
          socket.emit('started', { err: err.message, payload })
          // console.log(`error>>>`, err)
        }
      })

      // stop the process
      socket.on('stop', (payload) => {
        try {
          socket.emit('stopped', { res: this.stop(payload).toJSON() })
        } catch (err) {
          socket.emit('stopped', { err: err.message })
          // console.log(`error>>>`, err)
        }
      })

      // status of the process
      // todo: add security layer per method using JWT
      socket.on('exec', async (rawRequest) => {
        const { request, then: result } = this._exec(rawRequest)
        const resultId = `res-${ request.id }`

        this.emit(`request-start`, { socket, request })

        try {
          socket.emit(resultId, { result: await result() })
        } catch (err) {
          socket.emit(resultId, { error: err.message })
          console.log(`error>>>`, err)
        }

        this.emit(`request-end`, { socket, request })
        this.emit(`request-end-${ request.id }`, { socket, request })

      })
    })
  }

  /**
   *
   * @param {Request} request
   * @return {{request: Request, then: Function}}
   * @private
   */
  _exec (request) {
    request = RequestSchema.parse(request)

    if (/^_/.test(request.method) || !this[request.method]) {
      throw new Error(`Unknown command`)
    }

    return { request, then: () => this[request.method](...castArray(request.payload)) }
  }

  /**
   * Stops socket.io for IPC
   * @private
   */
  _stopDaemonComm () {
    if (!this.server) {
      return
    }
    this.server.close()
    this.server = null
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
    if (pid) {
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
    // runningProcess.removeAllListeners()

    if (runningProcessIndex >= 0) {
      this._runningProcesses.splice(runningProcessIndex, 1)
    }

    if (this.config.autoClose && this._runningProcesses.length === 0) {
      setTimeout(() => {
        if (this._runningProcesses.length === 0) {
          console.log(`Closing process manager since no sub-processes are running`)
          process.exit(0)
        }
      }, 1000)
    }
  }

  list () {
    return this._runningProcesses
  }

  /**
   * Forks a process & starts monitoring it
   * @param {String} id - Optional identifier for the process. If none if provided, the system will automatically try
   * to guess one.
   * @param {SpawnArgs} spawnArgs
   * @param {RunningProcessOptions} runningProcessOptions
   */
  fork ({ id, spawnArgs, runningProcessOptions }) {
    const foundProcess = this.findProcessById(id)

    if (foundProcess) {
      return foundProcess
    }

    // console.log({ id, spawnArgs, runningProcessOptions })
    const runningProcess = new RunningProcess(id, spawnArgs, runningProcessOptions)

    const onExit = () => {
      runningProcess.off('output', ioOutputPipe)
      runningProcess.off('error-output', ioErrorOutputPipe)
      runningProcess.off('exit', onExit)
      this._exit(runningProcess)
    }

    const ioOutputPipe = input => {
      const destination = `progress-${ runningProcess.id }`
      // console.log({ destination, input })
      // this._io.emit(destination, input)
      this.emit(destination, input)
    }

    const ioErrorOutputPipe = error => {
      // console.log({ error })
      // this._io.emit(`error-${ runningProcess.id }`, error)
      this.emit(`error-${ runningProcess.id }`, error)
    }

    runningProcess.on('output', ioOutputPipe)
    runningProcess.on('error-output', ioErrorOutputPipe)
    runningProcess.on('exit', onExit)
    this._runningProcesses.push(runningProcess)

    return runningProcess
  }

  /**
   *
   * @param {String} id
   */
  stop (id) {
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
