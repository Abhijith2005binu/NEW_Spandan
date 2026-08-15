import mongoose from 'mongoose'

const bankOptionSchema = new mongoose.Schema({
  text: { type: String, required: true },
  isCorrect: { type: Boolean, default: false }
}, { _id: false })

const questionBankSchema = new mongoose.Schema({
  teacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  folderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'QuestionBankFolder',
    index: true
  },
  type: {
    type: String,
    enum: ['MCQ', 'TF', 'MSQ', 'open-ended'],
    required: true
  },
  questionText: {
    type: String,
    required: true
  },
  options: [bankOptionSchema],
  correctAnswer: {
    type: String,
    default: ''
  },
  explanation: {
    type: String,
    default: ''
  },
  topic: {
    type: String,
    default: '',
    index: true
  },
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard'],
    default: 'medium'
  },
  provenance: {
    origin: { type: String, enum: ['ai-generated', 'manual', 'imported'], required: true },
    sourceSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room' },
    sourceTranscriptSnippet: String,
    aiProvider: String,
    promptTemplateId: { type: mongoose.Schema.Types.ObjectId, ref: 'PromptTemplate' },
    promptVersion: Number,
    generatedAt: Date,
    approvedAt: Date,
    editedBeforeApproval: { type: Boolean, default: false }
  },
  usageHistory: [{
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room' },
    usedAt: Date,
    correctRate: Number,
    avgResponseTime: Number
  }],
  tags: [{
    type: String,
    lowercase: true,
    trim: true
  }],
  isArchived: {
    type: Boolean,
    default: false
  }
}, { timestamps: true })

questionBankSchema.index({ teacherId: 1, isArchived: 1, createdAt: -1 })
questionBankSchema.index({ teacherId: 1, topic: 1 })
questionBankSchema.index({ questionText: 'text', tags: 'text', topic: 'text' })

export default mongoose.model('QuestionBank', questionBankSchema)