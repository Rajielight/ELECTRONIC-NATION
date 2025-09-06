# e-nation-passkey (sidecar)

Minimal WebAuthn (Passkey) registration server.
- `/register` (static) + `/api/webauthn/*`
- SQLite storage in `passkeys.sqlite`

## Local run
cd e-nation-passkey
npm install
npm run dev
# open http://localhost:4000/register
