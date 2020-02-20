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
 * @classdesc Holds the information of a running process
 */
export class RunningProcess extends EventEmitter {
  /**
   * @param {String} id - The command to run.
   * @param {SpawnArgs} spawnArgs - Spawn arguments
   * @param {RunningProcessOptions} options - Configuration options
   */
  constructor (id, spawnArgs, options = {}) {
    super()
    this._id = id || uuid()
    this._spawnArgs = spawnArgs
    this._spawnChild = null
    this._options = Object.assign({}, defaultOptions, options)
    this._started = Date.now()
    this._lastRestarted = Date.now()
    this._restarts = 0
    this._stop = false // determines whether the program can be started again or not
    this.start()
  }

  get restarts () {
    return this._restarts
  }

  get started () {
    return this._started
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

    this._spawnChild = spawn(this._spawnArgs.command,
      this._spawnArgs.args,
      options
    )

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
      console.log(`data`, s.toString())
    })

    this._spawnChild.on('error', err => {
      console.log(`sub process error`, err)
    })

    this._spawnChild.on('exit', (err) => {
      // unref
      this._spawnChild = null

      if (!this._stop && this._options.autoRestart) {
        console.log(`restarting`, this.id)

        setTimeout(() => {
          this.restart()
        }, this._options.waitBeforeRestart)
      } else {
        this.emit('done', { result, error })
      }
    })

    return this._spawnChild
  }

  /**
   * Re-starts the program
   */
  restart () {
    if (this._options.maximumAutoRestart >= 0 && this._restarts + 1 > this._options.maximumAutoRestart) {
      return this.stop()
    }

    this._restarts++
    this._lastRestarted = Date.now()
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
    await kill(this.pid)
    this._spawnChild = null
    this.emit('exit')
    this.removeAllListeners()
  }

  toJSON () {
    return {
      id: this._id,
      pid: this._spawnChild ? (this._spawnChild.pid || '-!') : '--',
      started: this._started,
      lastRestarted: this._lastRestarted,
      restarts: this._restarts,
      spawnArgs: this._spawnArgs,
      stop: this._stop
    }
  }
}
