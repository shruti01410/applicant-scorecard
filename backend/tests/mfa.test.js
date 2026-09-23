const test = require('node:test');
const assert = require('node:assert');
const { generateSecret, totp, verify, otpauthURI, base32Encode, base32Decode } = require('../mfa');

test('MFA1. generateSecret returns a Base32 string of sufficient length', () => {
  const s = generateSecret();
  assert.match(s, /^[A-Z2-7]+$/);
  assert.ok(s.length >= 32, 'secret should be at least 32 Base32 chars (160 bits)');
});

test('MFA2. base32 encode/decode round-trips', () => {
  const buf = Buffer.from('Hello, World!!');
  const enc = base32Encode(buf);
  const dec = base32Decode(enc);
  assert.deepEqual(Buffer.from(dec), buf);
});

test('MFA3. totp generates a 6-digit code', () => {
  const s = generateSecret();
  const code = totp(s);
  assert.match(code, /^\d{6}$/);
});

test('MFA4. verify accepts the current code', () => {
  const s = generateSecret();
  const code = totp(s);
  assert.equal(verify(s, code), true);
});

test('MFA5. verify accepts adjacent time steps (clock skew window)', () => {
  const s = generateSecret();
  const now = Date.now();
  const prev = totp(s, now - 30000);
  const next = totp(s, now + 30000);
  assert.equal(verify(s, prev), true, 'previous step within ±1 window');
  assert.equal(verify(s, next), true, 'next step within ±1 window');
});

test('MFA6. verify rejects a wrong code', () => {
  const s = generateSecret();
  // A code from a different secret is effectively random — still 6 digits.
  const wrong = totp(generateSecret());
  assert.equal(verify(s, wrong), false);
});

test('MFA7. verify rejects non-6-digit input', () => {
  const s = generateSecret();
  assert.equal(verify(s, '12345'), false);
  assert.equal(verify(s, 'abcdef'), false);
  assert.equal(verify(s, ''), false);
});

test('MFA8. otpauth URI has the expected shape', () => {
  const s = generateSecret();
  const uri = otpauthURI(s, 'test123@humsee.works');
  assert.ok(uri.startsWith('otpauth://totp/'));
  assert.ok(uri.includes(`secret=${s}`));
  assert.ok(uri.includes('issuer=HUMSEE'));
  assert.ok(uri.includes('period=30'));
});
