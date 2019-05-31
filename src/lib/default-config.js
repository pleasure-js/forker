import path from 'path'

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

let envConfig = {}

if (process.env.DAEMONIZER_DAEMON_CONFIG) {
  envConfig = JSON.parse(process.env.DAEMONIZER_DAEMON_CONFIG)
}

export const defaultConfig = Object.assign({
  runningThread: path.join(__dirname, '../.running'),
  port: process.env.DAEMONIZER_DEAMON_PORT || 1111,
  ip: '127.0.0.1'
}, envConfig)
