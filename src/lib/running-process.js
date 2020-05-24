import { EventEmitter } from 'events'
import { spawn } from 'child_process'
import Kill from 'tree-kill'
import util from 'util'
import { uuid } from './uuid.js'

const kill = util.promisify(Kill)

/**
 * @typedef {Object} RunningProcessOptions - Spawn arguments
 * @property {Boolean} [options.autoRestart=true] - Whether to automatically restart the application after failure.
 * @property {Number} [options.waitBeforeRestart=1000] - Milliseconds to wait before triggering `autoRestart`.
 * @property {Number} [options.maximumAutoRestart=100] - Maximum amount of time the process can be autorestarted. Negative for infinite.
 * @see [child_process.spawn](https://nodejs.org/api/child_process.html#child_process_child_process_spawn_command_args_options)
 */

export const defaultOptions = {
  autoRestart: true,
  waitBeforeRestart: 1000
}

export const spawnDefaultOptions = {
  cwd: process.cwd(),
  stdio: 'ignore'
}

/**
 * @typedef {Object} SpawnArgs - Spawn arguments
 * @property {String} command - The command to run.
 * @property {Array} args - List of string arguments.
 * @property {Object} options - `child_process.spawn`
 * @see [child_process.spawn](https://nodejs.org/api/child_process.html#child_process_child_process_spawn_command_args_options)
 */

/**
 * @classdesc A running process
 * @property {String} _id - daemonizer process id
 * @property {SpawnArgs} _spawnArgs - spawn arguments used to create the process
 * @property {RunningProcessOptions} _options - Running process configuration options
 * @property {Date} started  - When the process was requested
 * @property {Date} lastRestart  - When the process was restarted the last time
 * @property {Date} lastRestart  - When the process was restarted the last time
 */
export class RunningProcess extends EventEmitter {
  /**
   * @param {String} id - Desired daemonizer process id
   * @param {SpawnArgs} spawnArgs - Spawn arguments to create the process
   * @param {RunningProcessOptions} options - Configuration options
   */
  constructor (id, spawnArgs, options = {}) {
    // console.log(`running process`, { id, spawnArgs, options })
    super()
    this._id = id || uuid()
    this._spawnArgs = spawnArgs
    this._spawnChild = null
    this._options = Object.assign({}, defaultOptions, options)
    this._started = Date.now()
    this._lastRestart = Date.now()
    this._restarts = []
    this._stop = false // determines whether the program can be started again or not
    this.start()
  }

  get restarts () {
    return this._restarts.length
  }

  get restartsReport () {
    return this._restarts
  }

  get started () {
    return this._started
  }

  get lastRestart () {
    return this._lastRestart
  }

  get pid () {
    return this._spawnChild ? this._spawnChild.pid : null
  }

  get id () {
    return this._id
  }

  /**
   * Runs the program
   */
  start () {
    if (this._stop) {
      return
    }

    if (this._spawnChild) {
      return this._spawnChild
    }

    const options = Object.assign(
      {},
      spawnDefaultOptions,
      this._options
    )

    // console.log({ options })
    const spawnArgs = [this._spawnArgs.command,
      this._spawnArgs.args,
      options
    ]
    // console.log(`spawning`, ...spawnArgs)
    this._spawnChild = spawn(...spawnArgs)

    const result = []
    const error = []

    if (this._spawnChild.stdout) {
      this._spawnChild.stdout.on('data', output => {
        output = output.toString()
        result.push(output)

        this.emit('output', output)
      })
    }

    if (this._spawnChild.stderr) {
      this._spawnChild.stderr.on('data', err => {
        err = err.toString()
        error.push(err)

        this.emit('error-output', err)
      })
    }

    this._spawnChild.on('data', s => {
      // console.log(`data`, s.toString())
    })

    this._spawnChild.on('error', err => {
      // console.log(`sub process error`, err)
    })

    this._spawnChild.on('exit', (err) => {
      // unref
      this._spawnChild = null

      if (!this._stop && this._options.autoRestart) {
        console.log(`restarting`, this.id, err)

        setTimeout(() => {
          this.restart()
        }, this._options.waitBeforeRestart)
      } else {
        this.emit('done', { result, error })
        this
          .stop()
          .catch(err => {
            console.log(`Error auto-stopping process ${ this.id }`)
          })
      }
    })

    return this._spawnChild
  }

  /**
   * Re-starts the program
   */
  restart () {
    if (this._options.maximumAutoRestart >= 0 && this._restarts.length + 1 > this._options.maximumAutoRestart) {
      return this.stop()
    }

    this._lastRestart = Date.now()
    this._restarts.push(this._lastRestart)
    return this.start()
  }

  /**
   * Re-starts the program
   */
  async stop () {
    if (this._stop) {
      return
    }
    this._stop = true
    if (this.pid) {
      await kill(this.pid)
    }
    this._spawnChild = null
    this.emit('exit')
    this.removeAllListeners()
  }

  toJSON () {
    return {
      id: this._id,
      pid: this._spawnChild ? (this._spawnChild.pid || '-!') : '--',
      started: this._started,
      lastRestart: this._lastRestart,
      restarts: this._restarts,
      spawnArgs: this._spawnArgs,
      stop: this._stop
    }
  }
}
