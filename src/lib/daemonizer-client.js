import { RequestSchema } from './request.js'
import io from 'socket.io-client'
import { defaultConfig as defaultServerConfig } from './default-config.js'
import { EventEmitter } from 'events'

class RequestError extends Error {
  constructor (message, request) {
    super(message)
    this.request = request
  }
}

export const daemonizerClientConfig = {
  connectionTimeout: 30000,
  timeout: 10000
}

let singleton

export class DaemonizerClient extends EventEmitter {
  constructor (config = {}) {
    super()

    if (singleton) {
      throw new Error(`This class is meant to be used as a singleton`)
    }
    this.config = Object.assign({}, defaultServerConfig, daemonizerClientConfig, config)
    this.io = io(`http://${ this.config.ip }:${ this.config.port }`)

    this.io.on('connect', () => {
      this.emit('ready')
    })

    this.io.on('connect_error`', (err) => {
      this.emit('error', err)
    })
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
            })
            const resId = `res-${ request.id }`

            target.io.emit('exec', request)
            target.io.once(resId, ({ error, result }) => {
              clearTimeout(to)
              if (error) {
                return reject(new RequestError(error, request))
              }

              resolve(result)
            })

            const to = setTimeout(() => {
              target.io.off(resId)
              reject(new RequestError(`Timed out`, request))
            }, Math.max(target.config.timeout, 1))
          })
        }
      }
    })
  }
}
