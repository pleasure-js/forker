import axios from 'axios'
import io from 'socket.io-client'
import { defaultConfig } from '../../src/lib/default-config.js'

const url = `http://${ defaultConfig.ip }:${ defaultConfig.port }`

export const driver = axios.create({
  baseURL: url
})

export const socket = io(url)
