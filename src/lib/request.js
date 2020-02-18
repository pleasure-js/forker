import { Schema, Transformers } from '@devtin/schema-validator'

const UUIDPattern = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/
Transformers.id = {
  settings: {
    loaders: [{
      type: String,
      regex: [UUIDPattern, `{ value } is not a valid UUID`]
    }],
    required: false,
    default () {
      // GUID / UUID RFC4122 version 4 taken from: https://stackoverflow.com/a/2117523/1064165
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        let r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8)
        return v.toString(16)
      })
    }
  }
}

export const RequestSchema = new Schema({
  id: {
    type: 'id',
    required: false
  },
  command: {
    type: String,
    required: [true, `Please enter the command to execute`]
  },
  payload: {
    type: Array,
    required: false,
    default () {
      return []
    }
  }
})
