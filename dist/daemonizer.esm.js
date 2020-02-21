/*!
 * @pleasure-js/daemonizer v1.0.0
 * (c) 2019-2020 Martin Rafael <tin@devtin.io>
 * MIT
 */
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import Kill from 'tree-kill';
import util from 'util';
import Koa from 'koa';
import koaBody from 'koa-body';
import Router from 'koa-router';
import SocketIO from 'socket.io';
import path from 'path';
import fs from 'fs';
import isRunning from 'is-running';
import { writeJsonSync, readJsonSync } from 'fs-extra';
import pidusage from 'pidusage';
import Promise from 'bluebird';
import filesize from 'filesize';
import { Transformers, Schema } from '@devtin/schema-validator';
import castArray from 'lodash/castArray';

function uuid () {
  // GUID / UUID RFC4122 version 4 taken from: https://stackoverflow.com/a/2117523/1064165
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    let r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16)
  })
}

const UUIDPattern = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/;

const kill = util.promisify(Kill);

/**
 * @typedef {Object} RunningProcessOptions - Spawn arguments
 * @property {Boolean} [options.autoRestart=true] - Whether to automatically restart the application after failure.
 * @property {Number} [options.waitBeforeRestart=1000] - Milliseconds to wait before triggering `autoRestart`.
 * @property {Number} [options.maximumAutoRestart=100] - Maximum amount of time the process can be autorestarted. Negative for infinite.
 * @see [child_process.spawn](https://nodejs.org/api/child_process.html#child_process_child_process_spawn_command_args_options)
 */

const defaultOptions = {
  autoRestart: true,
  waitBeforeRestart: 1000
};

const spawnDefaultOptions = {
  cwd: process.cwd(),
  stdio: 'ignore'
};

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
class RunningProcess extends EventEmitter {
  /**
   * @param {String} id - The command to run.
   * @param {SpawnArgs} spawnArgs - Spawn arguments
   * @param {RunningProcessOptions} options - Configuration options
   */
  constructor (id, spawnArgs, options = {}) {
    // console.log(`running process`, { id, spawnArgs, options })
    super();
    this._id = id || uuid();
    this._spawnArgs = spawnArgs;
    this._spawnChild = null;
    this._options = Object.assign({}, defaultOptions, options);
    this._started = Date.now();
    this._lastRestarted = Date.now();
    this._restarts = 0;
    this._stop = false; // determines whether the program can be started again or not
    this.start();
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
    );

    // console.log({ options })
    const spawnArgs = [this._spawnArgs.command,
      this._spawnArgs.args,
      options
    ];
    // console.log(`spawning`, ...spawnArgs)
    this._spawnChild = spawn(...spawnArgs);

    const result = [];
    const error = [];

    if (this._spawnChild.stdout) {
      this._spawnChild.stdout.on('data', output => {
        output = output.toString();
        result.push(output);

        this.emit('output', output);
      });
    }

    if (this._spawnChild.stderr) {
      this._spawnChild.stderr.on('data', err => {
        err = err.toString();
        error.push(err);

        this.emit('error-output', err);
      });
    }

    this._spawnChild.on('data', s => {
      // console.log(`data`, s.toString())
    });

    this._spawnChild.on('error', err => {
      // console.log(`sub process error`, err)
    });

    this._spawnChild.on('exit', (err) => {
      // unref
      this._spawnChild = null;

      if (!this._stop && this._options.autoRestart) {
        console.log(`restarting`, this.id, err);

        setTimeout(() => {
          this.restart();
        }, this._options.waitBeforeRestart);
      } else {
        this.emit('done', { result, error });
      }
    });

    return this._spawnChild
  }

  /**
   * Re-starts the program
   */
  restart () {
    if (this._options.maximumAutoRestart >= 0 && this._restarts + 1 > this._options.maximumAutoRestart) {
      return this.stop()
    }

    this._restarts++;
    this._lastRestarted = Date.now();
    return this.start()
  }

  /**
   * Re-starts the program
   */
  async stop () {
    if (this._stop) {
      return
    }
    this._stop = true;
    if (this.pid) {
      await kill(this.pid);
    }
    this._spawnChild = null;
    this.emit('exit');
    this.removeAllListeners();
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

/**
 * @typedef {Object} ENV
 * @desc Environmental variables
 * @property {String} [DAEMONIZER_CONFIG] - JSON stringified string with default {@link DaemonizerConfig} configuration options.
 * @property {Boolean} [DAEMONIZER_DAEMON_START] - When `true`, triggers automatically {@link DaemonizerServer.start}
 */

/**
 * @typedef {Object} DaemonizerConfig
 * @property {String} [runningThread=../.running] - Path to file for storing information about the running thread.
 * @property {Number} port - Port where socket.io will listen for connections.
 * @property {String} ip - IP address where socket.io will bind.
 */

let envConfig = {};

if (process.env.DAEMONIZER_DAEMON_CONFIG) {
  envConfig = JSON.parse(process.env.DAEMONIZER_DAEMON_CONFIG);
}

const defaultConfig = Object.assign({
  runningThread: path.join(__dirname, '../.running'),
  port: 1111,
  autoClose: false,
  ip: '127.0.0.1'
}, envConfig);

Transformers.id = {
  settings: {
    loaders: [{
      type: String,
      regex: [UUIDPattern, `{ value } is not a valid UUID`]
    }],
    required: false,
    default: uuid
  }
};

/**
 * @typedef {Object} Request
 * @property {String} id - uuid
 * @property {String} method - the method
 * @property {Array} payload - arguments to pass to given method
 * @type {Schema}
 */
const RequestSchema = new Schema({
  id: {
    type: 'id',
    required: false
  },
  method: {
    type: String,
    required: [true, `Please enter the method to execute`]
  },
  payload: {
    type: Array,
    required: false,
    default () {
      return []
    }
  }
});

const pidInfo = Promise.promisify(pidusage);

const spawnDefaultOptions$1 = {
  cwd: process.cwd()
};

/**
 * @classdec DaemonizerDaemon is the process manager that creates and control multiple spawned processes.
 */

class DaemonizerServer extends EventEmitter {
  constructor (config = {}) {
    super();
    this._runningProcesses = [];
    this.config = Object.assign({}, defaultConfig, config);
    this._startDaemonComm();

    // save pid
    writeJsonSync(this.config.runningThread, Object.assign({}, this.config, { pid: process.pid }));

    // fork logic
    this.on('request-start', ({ socket, request }) => {
      if (request.method === 'fork') {
        const processId = request.payload[0].id = request.payload[0].id || uuid();
        const progress = (...payload) => { socket.emit(`progress-${ processId }`, ...payload); };

        this.on(`progress-${ processId }`, progress);
        this.once(`request-end-${ processId }`, () => {
          this.off(`progress-${ processId }`, progress);
        });
      }
    });
  }

  /**
   * Starts socket.io for IPC
   * @private
   */
  _startDaemonComm () {
    const router = Router();
    const app = new Koa();

    app.use(koaBody());

    app.use(async (ctx, next) => {
      try {
        await next();
      } catch (err) {
        ctx.body = { error: err.message };
        console.log(err);
      }
    });

    router.post(`/fork`, async ctx => {
      // todo: add jwt auth
      const fork = ctx.request.body;

      if (Object.hasOwnProperty.call(ctx.request.query, 'wait')) {
        Object.assign(fork, {
          runningProcessOptions: {
            stdio: ['pipe', 'pipe', 'pipe'],
            autoRestart: false
          }
        });
      }

      const runningProcess = this.fork(fork);
      const { id } = runningProcess;

      if (Object.hasOwnProperty.call(ctx.request.query, 'wait')) {
        ctx.body = {
          id,
          ...(await (new Promise((resolve) => {
            runningProcess.on('done', resolve);
          })))
        };
        return
      }

      ctx.body = { id };
    });

    app.use(router.routes());

    this.server = app.listen(this.config.port, this.config.ip, () => {
      this.emit('ready');
    });

    this._io = SocketIO(this.server);

    this._io.on('connect', socket => {
      // start a new process
      socket.on('start', (payload) => {
        try {
          socket.emit('started', { res: this.fork(payload).toJSON() });
        } catch (err) {
          socket.emit('started', { err: err.message, payload });
          // console.log(`error>>>`, err)
        }
      });

      // stop the process
      socket.on('stop', (payload) => {
        try {
          socket.emit('stopped', { res: this.stop(payload).toJSON() });
        } catch (err) {
          socket.emit('stopped', { err: err.message });
          // console.log(`error>>>`, err)
        }
      });

      // status of the process
      // todo: add security layer per method using JWT
      socket.on('exec', async (rawRequest) => {
        const { request, then: result } = this._exec(rawRequest);
        const resultId = `res-${ request.id }`;

        this.emit(`request-start`, { socket, request });

        try {
          socket.emit(resultId, { result: await result() });
        } catch (err) {
          socket.emit(resultId, { error: err.message });
          console.log(`error>>>`, err);
        }

        this.emit(`request-end`, { socket, request });
        this.emit(`request-end-${ request.id }`, { socket, request });
      });
    });
  }

  /**
   *
   * @param {Request} request
   * @return {{request: Request, then: Function}}
   * @private
   */
  _exec (request) {
    request = RequestSchema.parse(request);

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
    this.server.close();
    this.server = null;
  }

  /**
   * Returns a {@link RunningProcess} given an `id`.
   * @param {String} id - SubProcess id (different than pid)
   * @return {RunningProcess|void} The running process
   */
  findProcessById (id) {
    let foundProcess;
    if (id) {
      this._runningProcesses.forEach(runningProcess => {
        if (runningProcess.id === id) {
          foundProcess = runningProcess;
        }
      });
    }
    return foundProcess
  }

  /**
   * Returns a {@link RunningProcess} given an `id`.
   * @param {String} pid - Process id
   * @return {RunningProcess|void} The running process
   */
  findProcessByPid (pid) {
    let foundProcess;
    if (pid) {
      this._runningProcesses.forEach(runningProcess => {
        if (runningProcess.pid === pid) {
          foundProcess = runningProcess;
        }
      });
    }
    return foundProcess
  }

  _exit (runningProcess) {
    runningProcess.pid && console.log(`Closing process '${ runningProcess.pid }'`);
    const runningProcessIndex = this._runningProcesses.indexOf(runningProcess);
    // runningProcess.removeAllListeners()

    if (runningProcessIndex >= 0) {
      this._runningProcesses.splice(runningProcessIndex, 1);
    }

    if (this.config.autoClose && this._runningProcesses.length === 0) {
      setTimeout(() => {
        if (this._runningProcesses.length === 0) {
          console.log(`Closing process manager since no sub-processes are running`);
          process.exit(0);
        }
      }, 1000);
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
    // console.log(`fork`, { id, spawnArgs, runningProcessOptions })
    const foundProcess = this.findProcessById(id);

    if (foundProcess) {
      return foundProcess
    }

    // console.log({ id, spawnArgs, runningProcessOptions })
    const runningProcess = new RunningProcess(id, spawnArgs, runningProcessOptions);

    const onExit = () => {
      runningProcess.off('output', ioOutputPipe);
      runningProcess.off('error-output', ioErrorOutputPipe);
      runningProcess.off('exit', onExit);
      this._exit(runningProcess);
    };

    const ioOutputPipe = input => {
      const destination = `progress-${ runningProcess.id }`;
      // console.log({ destination, input })
      // this._io.emit(destination, input)
      this.emit(destination, input);
    };

    const ioErrorOutputPipe = error => {
      // console.log({ error })
      // this._io.emit(`error-${ runningProcess.id }`, error)
      this.emit(`error-${ runningProcess.id }`, error);
    };

    runningProcess.on('output', ioOutputPipe);
    runningProcess.on('error-output', ioErrorOutputPipe);
    runningProcess.on('exit', onExit);
    this._runningProcesses.push(runningProcess);

    return runningProcess
  }

  /**
   *
   * @param {String} id
   */
  stop (id) {
    const runningProcess = this.findProcessById(id);
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
    config = Object.assign({}, defaultConfig, config);
    // console.log({ config })
    if (fs.existsSync(config.runningThread)) {
      const { pid } = readJsonSync(config.runningThread);
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
    config = Object.assign({}, defaultConfig, config);
    const runningPid = DaemonizerServer.isRunning(config);

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
    });

    child.unref();
    return child.pid
  }

  static ensureRunning () {
    if (!DaemonizerServer.isRunning()) {
      return DaemonizerServer.start()
    }
  }

  async status ({ id }) {
    // connects to main thread via socket
    // gets status
    const processTable = [];

    await Promise.each(this._runningProcesses, async (runningProcess) => {
      if (id && runningProcess.id !== id) {
        return
      }

      let cpu = 0;
      let memory = 0;
      let elapsed = 0;
      if (runningProcess.pid) {
        ({ cpu = 0, memory = 0, elapsed = 0 } = await pidInfo(runningProcess.pid));
      }

      processTable.push(Object.assign(runningProcess.toJSON(), {
        cpu: cpu.toFixed(1),
        memory: filesize(memory),
        elapsed: elapsed / 1000
      }));
    });

    return processTable
  }
}

if (process.env.DAEMONIZER_DAEMON_START) {
  new DaemonizerServer();
}

export { DaemonizerServer };
