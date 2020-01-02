/*!
 * @pleasure-js/daemonizer v1.0.0
 * (c) 2019-2020 Martin Rafael <tin@devtin.io>
 * MIT
 */
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import 'cli-table';
import 'moment';
import http from 'http';
import SocketIO from 'socket.io';
import path from 'path';
import fs from 'fs';
import isRunning from 'is-running';
import { writeJsonSync, readJsonSync } from 'fs-extra';
import pidusage from 'pidusage';
import Promise$1 from 'bluebird';
import filesize from 'filesize';
import io from 'socket.io-client';

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
  cwd: process.cwd()
};

const spawnRequiredOptions = {
  // detached: true,
  stdio: 'ignore'
};

/**
 * @typedef {Object} SpawnArgs - Spawn arguments
 * @property {String} command - The command to run.
 * @property {Array} args - List of string arguments.
 * @property {Object} options - `child_process.spawn` options.
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
    super();
    this._id = id || Date.now();
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

    const toSpawn = {
      command: this._spawnArgs.command,
      args: this._spawnArgs.args,
      options: Object.assign(
        {},
        spawnDefaultOptions,
        this._spawnArgs.options, spawnRequiredOptions
      )
    };

    console.log(JSON.stringify(toSpawn));

    this._spawnChild = spawn(
      this._spawnArgs.command,
      this._spawnArgs.args,
      Object.assign(
        {},
        spawnDefaultOptions,
        this._spawnArgs.options, spawnRequiredOptions
      )
    );

    this._spawnChild.on('error', err => {
      console.log(`sub process error`, err);
    });

    this._spawnChild.on('exit', (err) => {
      console.log(`restarting because`, err);
      // unref
      this._spawnChild = null;

      if (!this._stop && this._options.autoRestart) {
        setTimeout(() => {
          this.restart();
        }, this._options.waitBeforeRestart);
      } else {
        this.emit('exit');
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
  stop () {
    this._stop = true;
    if (this._spawnChild) {
      this._spawnChild.kill('SIGINT');
      this._spawnChild = null;
    }
    this.emit('exit');
    this.removeAllListeners();
    return this
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
  port: process.env.DAEMONIZER_DEAMON_PORT || 1111,
  ip: '127.0.0.1'
}, envConfig);

const pidInfo = Promise$1.promisify(pidusage);

const spawnDefaultOptions$1 = {
  cwd: process.cwd()
};

/**
 * @classdec DaemonizerDaemon is the process manager that creates and control multiple spawned processes to monitor.
 */

class DaemonizerServer {
  constructor (config = {}) {
    this._runningProcesses = [];
    this.config = Object.assign({}, defaultConfig, config);
    this._startDaemeonComm();

    // save pid
    writeJsonSync(this.config.runningThread, Object.assign({}, this.config, { pid: process.pid }));
  }

  _startDaemeonComm () {
    const server = http.createServer();
    this._io = SocketIO(server);

    this._io.on('connect', socket => {
      // start a new process
      socket.on('start', (payload) => {
        try {
          socket.emit('started', { res: this.fork(payload).toJSON() });
        } catch (err) {
          socket.emit('started', { err: err.message, payload });
          console.log(`error>>>`, err);
        }
      });

      // stop the process
      socket.on('stop', (payload) => {
        try {
          socket.emit('stopped', { res: this.stop(payload).toJSON() });
        } catch (err) {
          socket.emit('stopped', { err: err.message });
          console.log(`error>>>`, err);
        }
      });

      // status of the process
      socket.on('status', async (payload) => {
        try {
          socket.emit('status', { res: await this.status(payload) });
        } catch (err) {
          socket.emit('status', { err: err.message });
          console.log(`error>>>`, err);
        }
      });
    });

    server.listen(this.config.port, this.config.ip);
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
    if (id) {
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

    if (this._runningProcesses.length === 0) {
      setTimeout(() => {
        if (this._runningProcesses.length === 0) {
          console.log(`Closing process manager since no sub-processes are running`);
          process.exit(0);
        }
      }, 1000);
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
    const foundProcess = this.findProcessById(id);

    if (foundProcess) {
      return foundProcess
    }

    const runningProcess = new RunningProcess(id, spawnArgs, processOptions);
    const onExit = this._exit.bind(this, runningProcess);

    runningProcess.on('exit', onExit);
    this._runningProcesses.push(runningProcess);

    return runningProcess
  }

  /**
   *
   * @param {String} id
   */
  stop ({ id }) {
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

  async status ({ id }) {
    // connects to main thread via socket
    // gets status
    const processTable = [];

    await Promise$1.each(this._runningProcesses, async (runningProcess) => {
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

const daemonizerConfig = {
  daemonServerConnectionTimeout: 5000
};

const spawnDefaultOptions$2 = {
  cwd: process.cwd()
};

/**
 * @classdec Daemonizer is a process manager that creates an instance to control multiple spawned processes to monitor.
 */

class Daemonizer {
  constructor (config = {}, serverConfig = {}) {
    this.config = Object.assign({}, daemonizerConfig, config);
    this.serverConfig = Object.assign({}, defaultConfig, serverConfig);
    this._startDaemonComm();
  }

  _startDaemonComm () {
    this.io = io(`http://${ this.serverConfig.ip }:${ this.serverConfig.port }`);
  }

  _resolver (resolve, reject) {
    const to = setTimeout(() => {
      reject(new Error('Timed out.'));
    }, this.config.daemonServerConnectionTimeout);

    return ({ err, res }) => {
      clearTimeout(to);
      if (err) {
        return reject(new Error(err))
      }

      resolve(res);
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
      DaemonizerServer.start();
    }

    return new Promise((resolve, reject) => {
      this.io.once('started', this._resolver(resolve, reject));
      this.io.emit('start', { id, spawnArgs, processOptions });
    })
  }

  async stop (id) {
    if (!DaemonizerServer.isRunning()) {
      throw new Error(`DaemonizerServer not running.`)
    }

    return new Promise((resolve, reject) => {
      this.io.once('stopped', this._resolver(resolve, reject));
      this.io.emit('stop', { id });
    })
  }

  async status (id) {
    if (!DaemonizerServer.isRunning()) {
      throw new Error(`DaemonizerServer not running.`)
    }

    return new Promise((resolve, reject) => {
      this.io.once('status', this._resolver(resolve, reject));
      this.io.emit('status', { id });
    })
  }
}

var index = {
  DaemonizerServer,
  Daemonizer
};

export default index;
