/**
 * e-nation-passkey: Minimal WebAuthn (Passkey) sidecar server
 * - Registration endpoints (+ optional login endpoints)
 * - SQLite (better-sqlite3)
 */
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const Database = require('better-sqlite3');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');
// NOTE: isoBase64URL は helpers サブモジュールから
const { isoBase64URL } = require('@simplewebauthn/server/helpers');

const app = express();
const PORT = process.env.PORT || 4000;
const RP_NAME = process.env.RP_NAME || 'Electronic Nation';

// === DB ===
const db = new Database(path.join(__dirname, 'passkeys.sqlite'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    nickname TEXT UNIQUE,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS credentials (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    credential_id TEXT UNIQUE,
    public_key TEXT,
    counter INTEGER,
    transports TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS challenges (
    user_id TEXT PRIMARY KEY,
    challenge TEXT,
    purpose TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

const qUserByNickname = db.prepare('SELECT * FROM users WHERE nickname = ?');
const qUserById       = db.prepare('SELECT * FROM users WHERE id = ?');
const iUser           = db.prepare('INSERT INTO users (id, nickname) VALUES (?, ?)');
const qCredsByUser    = db.prepare('SELECT * FROM credentials WHERE user_id = ?');
const qChallengeByUID = db.prepare('SELECT * FROM challenges WHERE user_id = ?');
const upsertChallenge = db.prepare(`
  INSERT INTO challenges (user_id, challenge, purpose) VALUES (?, ?, ?)
  ON CONFLICT(user_id) DO UPDATE SET challenge=excluded.challenge, purpose=excluded.purpose, created_at=CURRENT_TIMESTAMP;
`);
const iCredential     = db.prepare(`
  INSERT INTO credentials (id, user_id, credential_id, public_key, counter, transports)
  VALUES (?, ?, ?, ?, ?, ?)
`);

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(cors({ origin: true, credentials: true }));
app.use('/public', express.static(path.join(__dirname, 'public')));

function reqHost(req){ return (req.headers['x-forwarded-host'] || req.headers.host || '').toString(); }
function rpID(req){
  const env = (process.env.RP_ID || '').trim();
  if (env) return env;
  return reqHost(req).split(':')[0];
}
function expectedOrigin(req){
  const env = (process.env.EXPECTED_ORIGIN || '').trim();
  if (env) return env;
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').toString();
  return `${proto}://${reqHost(req)}`;
}

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

// === Registration: options ===
app.post('/api/webauthn/generate-registration-options', (req, res) => {
  try {
    const { nickname } = req.body || {};
    if (!nickname || typeof nickname !== 'string' || nickname.length < 2 || nickname.length > 32) {
      return res.status(400).json({ error: 'ニックネームを2〜32文字で入力してください' });
    }
    let user = qUserByNickname.get(nickname);
    if (!user) { user = { id: uuidv4(), nickname }; iUser.run(user.id, user.nickname); }

    const creds = qCredsByUser.all(user.id) || [];
    const excludeCredentials = creds.map(c => ({
      id: isoBase64URL.toBuffer(c.credential_id),
      type: 'public-key',
      transports: JSON.parse(c.transports || '[]'),
    }));

    const options = generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: rpID(req),
      userID: user.id,
      userName: user.nickname,
      userDisplayName: user.nickname,
      attestationType: 'none',
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred', authenticatorAttachment: 'platform' },
      excludeCredentials,
    });

    upsertChallenge.run(user.id, options.challenge, 'registration');
    return res.json({ user: { id: user.id, nickname: user.nickname }, options });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// === Registration: verify ===
app.post('/api/webauthn/verify-registration', async (req, res) => {
  try {
    const { userId, attestationResponse } = req.body || {};
    if (!userId || !attestationResponse) return res.status(400).json({ error: 'bad_request' });
    const user = qUserById.get(userId);
    if (!user) return res.status(404).json({ error: 'user_not_found' });

    const ch = qChallengeByUID.get(user.id);
    if (!ch || ch.purpose !== 'registration') return res.status(400).json({ error: 'challenge_not_found' });

    const verification = await verifyRegistrationResponse({
      response: attestationResponse,
      expectedChallenge: ch.challenge,
      expectedOrigin: expectedOrigin(req),
      expectedRPID: rpID(req),
      requireUserVerification: true,
    });

    const { verified, registrationInfo } = verification;
    if (!verified || !registrationInfo) return res.status(400).json({ error: 'verification_failed' });

    const { credentialPublicKey, credentialID, counter } = registrationInfo;
    const transports = Array.isArray(attestationResponse?.response?.transports) ? attestationResponse.response.transports : [];

    iCredential.run(
      uuidv4(),
      user.id,
      isoBase64URL.fromBuffer(credentialID),
      isoBase64URL.fromBuffer(credentialPublicKey),
      Number.isInteger(counter) ? counter : 0,
      JSON.stringify(transports)
    );

    return res.json({ ok: true, user: { id: user.id, nickname: user.nickname } });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// === (Optional) Login: options ===
app.post('/api/webauthn/generate-authentication-options', (req, res) => {
  try {
    const { nickname } = req.body || {};
    if (!nickname) return res.status(400).json({ error: 'nickname_required' });
    const user = qUserByNickname.get(nickname);
    if (!user) return res.status(404).json({ error: 'user_not_found' });

    const creds = qCredsByUser.all(user.id);
    const allowCredentials = creds.map(c => ({
      id: isoBase64URL.toBuffer(c.credential_id),
      type: 'public-key',
      transports: JSON.parse(c.transports || '[]'),
    }));

    const options = generateAuthenticationOptions({
      allowCredentials,
      userVerification: 'preferred',
      rpID: rpID(req),
    });

    upsertChallenge.run(user.id, options.challenge, 'authentication');
    return res.json({ user: { id: user.id, nickname: user.nickname }, options });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// === (Optional) Login: verify ===
app.post('/api/webauthn/verify-authentication', async (req, res) => {
  try {
    const { nickname, assertionResponse } = req.body || {};
    if (!nickname || !assertionResponse) return res.status(400).json({ error: 'bad_request' });
    const user = qUserByNickname.get(nickname);
    if (!user) return res.status(404).json({ error: 'user_not_found' });

    const ch = qChallengeByUID.get(user.id);
    if (!ch || ch.purpose !== 'authentication') return res.status(400).json({ error: 'challenge_not_found' });

    const creds = qCredsByUser.all(user.id);
    const cred = creds.find(c => c.credential_id === assertionResponse.id);
    if (!cred) return res.status(404).json({ error: 'credential_not_found' });

    const verification = await verifyAuthenticationResponse({
      response: assertionResponse,
      expectedChallenge: ch.challenge,
      expectedOrigin: expectedOrigin(req),
      expectedRPID: rpID(req),
      authenticator: {
        credentialID: isoBase64URL.toBuffer(cred.credential_id),
        credentialPublicKey: isoBase64URL.toBuffer(cred.public_key),
        counter: cred.counter || 0,
        transports: JSON.parse(cred.transports || '[]'),
      },
      requireUserVerification: true,
    });

    if (!verification.verified) return res.status(400).json({ error: 'verification_failed' });

    const newCounter = verification.authenticationInfo.newCounter;
    if (Number.isInteger(newCounter)) {
      db.prepare('UPDATE credentials SET counter=? WHERE credential_id=?')
        .run(newCounter, cred.credential_id);
    }
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

app.listen(PORT, () => {
  console.log(`[e-nation-passkey] listening on http://localhost:${PORT}`);
  console.log('Open /register to try passkey registration');
});
