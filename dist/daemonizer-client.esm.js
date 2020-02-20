/*!
 * @pleasure-js/daemonizer v1.0.0
 * (c) 2019-2020 Martin Rafael <tin@devtin.io>
 * MIT
 */
import { Transformers, Schema } from '@devtin/schema-validator';
import io from 'socket.io-client';
import path from 'path';
import { EventEmitter } from 'events';

function uuid () {
  // GUID / UUID RFC4122 version 4 taken from: https://stackoverflow.com/a/2117523/1064165
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    let r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16)
  })
}

const UUIDPattern = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/;

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

class RequestError extends Error {
  constructor (message, request) {
    super(message);
    this.request = request;
  }
}

const daemonizerClientConfig = {
  connectionTimeout: 30000,
  timeout: 10000
};

let singleton;

class DaemonizerClient extends EventEmitter {
  constructor (config = {}) {
    super();

    if (singleton) {
      throw new Error(`This class is meant to be used as a singleton`)
    }
    this.config = Object.assign({}, defaultConfig, daemonizerClientConfig, config);
    this.io = io(`http://${ this.config.ip }:${ this.config.port }`);

    this.io.on('connect', () => {
      this.emit('ready');
    });

    this.io.on('connect_error`', (err) => {
      this.emit('error', err);
    });
  }

  static instance (config) {
    if (singleton) {
      return singleton
    }

    return singleton = new Proxy(new DaemonizerClient(config), {
      get (target, method) {
        if (target[method]) {
          return target[method]
        }

        return (...payload) => {
          return new Promise((resolve, reject) => {
            const request = RequestSchema.parse({
              method,
              payload
            });
            const resId = `res-${ request.id }`;

            target.io.emit('exec', request);
            target.io.once(resId, ({ error, result }) => {
              clearTimeout(to);
              if (error) {
                return reject(new RequestError(error, request))
              }

              resolve(result);
            });

            const to = setTimeout(() => {
              target.io.off(resId);
              reject(new RequestError(`Timed out`, request));
            }, Math.max(target.config.timeout, 1));
          })
        }
      }
    })
  }
}

export { DaemonizerClient, daemonizerClientConfig };
