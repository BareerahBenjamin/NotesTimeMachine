import { createHash } from 'node:crypto';

const accountId = process.argv[2] ?? '';
if (process.argv.length !== 3 || !/^[1-9][0-9]*$/.test(accountId) || !Number.isSafeInteger(Number(accountId)) || process.stdin.isTTY) {
  console.error('Provide the verified numeric account ID and pipe a 64-character random lowercase hex code through stdin.');
  process.exit(1);
}

const chunks = [];
let length = 0;
for await (const chunk of process.stdin) {
  length += chunk.length;
  if (length > 65) break;
  chunks.push(chunk);
}
const code = Buffer.concat(chunks).toString('utf8').replace(/\n$/, '');
if (length > 65 || !/^[0-9a-f]{64}$/.test(code)) {
  console.error('Recovery code must contain 64 lowercase hexadecimal characters.');
  process.exit(1);
}
const digest = createHash('sha256').update(code).digest('hex');

// Generate SQL only. D1 credentials and execution remain with the verified operator.
// Neither the recovery code nor the previous hash is included in the output.
process.stdout.write(`
UPDATE users
SET password_hash = 'recovery-v1$' || (unixepoch('now') + 1800) || '$${digest}'
WHERE id = ${accountId} AND (
  (substr(password_hash, 1, 2) = 'h_' AND length(password_hash) = 18
   AND substr(password_hash, 3) NOT GLOB '*[^0-9a-f]*')
  OR (substr(password_hash, 1, 12) = 'recovery-v1$' AND length(password_hash) = 87)
)
RETURNING id;
`.trimStart());
