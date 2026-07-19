import mongoose from 'mongoose'
try {
  await mongoose.connect('mongodb://localhost:27017/spandan-test', { serverSelectionTimeoutMS: 3000 })
  console.log('CONNECTED OK')
  await mongoose.disconnect()
  process.exit(0)
} catch (e) {
  console.log('FAIL:', e.message)
  process.exit(1)
}
