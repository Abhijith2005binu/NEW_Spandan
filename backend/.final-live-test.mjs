// End-to-end verification: live HTTP against running backend.
const BASE = 'http://localhost:3001/api'

async function call(method, path, body, token) {
  const r = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  })
  const data = await r.json().catch(() => ({}))
  return { status: r.status, data }
}

let pass = 0, fail = 0
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  PASS  ${name}`) }
  else    { fail++; console.log(`  FAIL  ${name} -- ${detail}`) }
}

const stamp = Date.now()
const email = `qb-final-${stamp}@example.com`

let r = await call('POST', '/auth/register', { name: 'F', email, password: 'Pass123!', role: 'teacher' })
check('Register', r.status === 201)

r = await call('POST', '/auth/login', { email, password: 'Pass123!' })
const token = r.data.token
check('Login', !!token)

r = await call('POST', '/question-bank/from-room-question', {
  roomQuestion: { type: 'MCQ', question: 'Live test?', options: [{ text: 'Yes', isCorrect: true }, { text: 'No', isCorrect: false }] },
  topic: 'Test'
}, token)
check('Save MCQ', r.status === 201)
const id = r.data.question?._id

r = await call('GET', `/question-bank/${id}/import-ready`, null, token)
check('Import-ready 200', r.status === 200)
check('No _id leak', !('_id' in r.data.question))
check('No owner leak', !('owner' in r.data.question))
check('Has sourceBankId', r.data.question?.sourceBankId === id)

r = await call('DELETE', `/question-bank/${id}`, null, token)
check('Archive', r.status === 200)

r = await call('GET', `/question-bank/${id}/import-ready`, null, token)
check('404 after archive', r.status === 404)

r = await call('GET', '/question-bank/meta/topics', null, token)
check('Topics 200', r.status === 200)

r = await call('GET', '/question-bank', null, null)
check('Unauth -> 401', r.status === 401)

console.log(`\n=== LIVE: ${pass} passed, ${fail} failed ===`)
process.exit(fail > 0 ? 1 : 0)
