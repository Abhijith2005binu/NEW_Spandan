// Safely replace the corrupted lines in QuestionBankPage.jsx
import fs from 'fs'
const file = '../frontend/src/pages/QuestionBankPage.jsx'
let src = fs.readFileSync(file, 'utf8')

const lines = src.split('\n')
for (let i = 0; i < lines.length; i++) {
  // Replace any line that contains an unprintable/corrupted byte
  if (lines[i].match(/[\uFFFD]/)) {
    console.log(`Corrupted line ${i + 1}:`, JSON.stringify(lines[i]))
  }
}

// Replace corrupted "showToast" lines with correct ASCII versions.
// Pattern: showToast followed by corrupted bytes (the emojis \u2705 / \u26a0️).
// Use Unicode escape sequences to avoid the corrupted bytes altogether.

src = src.replace(
  /showToast\([^,\n]*, *'success'\)/g,
  "showToast('\u2705 Staged \u2014 open a room to add it', 'success')"
)
src = src.replace(
  /showToast\([^,\n]*, *'error'\)/g,
  "showToast('\u26a0\ufe0f Could not stage question', 'error')"
)

fs.writeFileSync(file, src, 'utf8')
console.log('Fixed. Size:', fs.statSync(file).size)

// Verify no more corrupted bytes
const remaining = src.match(/[\uFFFD]/g)
console.log('Remaining corrupted bytes:', remaining ? remaining.length : 0)
