import { Schema, Transformers } from '@devtin/schema-validator'
import { uuid, UUIDPattern } from './uuid.js'

Transformers.id = {
  settings: {
    loaders: [{
      type: String,
      regex: [UUIDPattern, `{ value } is not a valid UUID`]
    }],
    required: false,
    default: uuid
  }
}

/**
 * @typedef {Object} Request
 * @property {String} id - uuid
 * @property {String} method - the method
 * @property {Array} payload - arguments to pass to given method
 * @type {Schema}
 */
export const RequestSchema = new Schema({
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
})
