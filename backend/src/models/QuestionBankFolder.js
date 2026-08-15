import mongoose from 'mongoose'

const questionBankFolderSchema = new mongoose.Schema({
  teacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true
  },
  roomCode: {
    type: String,
    required: true,
    index: true
  },
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room'
  }
}, { timestamps: true })

questionBankFolderSchema.index({ teacherId: 1 })

export default mongoose.model('QuestionBankFolder', questionBankFolderSchema)
