# mp-generate-token

Lightweight Express app that publishes JWKS, signs a Maskinporten JWT assertion for testing, and exposes a demo resource that validates Maskinporten access tokens.

## Prerequisites
- Node 20+ and npm
- RSA private key in PEM format; use PKCS#1 (`-----BEGIN RSA PRIVATE KEY-----`)

## Setup
1) Generate a PKCS#1 private key and place it at `certs/private.pem` (or set a custom `PRIVATE_KEY_PATH`):
   - mac/linux: `openssl genrsa -traditional -out certs/private.pem 3072`
   - Windows: `ssh-keygen -t rsa -b 3072 -m PEM -f certs/private.pem`
   - If Maskinporten generates a key for you: download the private part, store it at `certs/private.pem`, and set `KEY_ID` to the `kid` shown in the client UI from digdir selvebetjening.

2) Create `.env` with required config:
   ```env
   ISSUER=...
   AUDIENCE=https://test.maskinporten.no/   # base for your env (test/prod)
   SCOPE=...
   CONSUMER=...
   KEY_ID=your-key-id   # choose a unique id per key/env
   PRIVATE_KEY_PATH=certs/private.pem
   PORT=4000
   API_AUDIENCE=https://example.no/your-api   # optional: aud check for demo resource
   ```

3) Install and run (Bun lockfile `bun.lock` is tracked):
   ```bash
   # with Bun (preferred)
   bun install
   bun run dev   # or bun run start
   ```

## Endpoints
- `GET /health` – simple status (kid, key status, audience info).
- `GET /jwks` – returns JWKS array for the public key (use in Maskinporten config).
- `GET /jwt_token` – returns `{ jwt_token }` assertion.
- `POST /access_token` – creates a fresh assertion and swaps it for an access token at `${AUDIENCE}/token`.
- `GET /demo_api` – demo resource protected by Maskinporten access token; validates signature, issuer (`AUDIENCE`), optional `API_AUDIENCE`, and scope.

## Using with Maskinporten
1) Fetch assertion (manual flow):
   ```bash
   curl http://localhost:4000/jwt_token | jq -r .jwt_token
   ```

2) Exchange for an access token (manual curl):
   ```bash
   curl -d "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion={jwt}" \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -X POST https://test.maskinporten.no/token
   ```
   Or call the app directly: `curl -X POST http://localhost:4000/access_token`

3) Call your API (or the local demo):
   ```bash
   ACCESS=$(curl -s -X POST http://localhost:4000/access_token | jq -r .access_token)
   curl -H "Authorization: Bearer ${ACCESS}" http://localhost:4000/demo_api
   # or your own API
   curl -H "Authorization: Bearer ${ACCESS}" https://example.no/tildelinger/v1
   ```

## Registering the public key in Maskinporten
- Option A (you generate key locally):
  1) Start the app and fetch JWKS:
     ```bash
     curl http://localhost:4000/jwks | jq -c '.[0]'
     ```
  2) In Maskinporten self service → Client → Nøkler → “Legg til ny”: paste that single JWK object into “JWK eller PEM format”. Ensure `kid` matches `KEY_ID` in `.env`.

- Option B (Maskinporten generates the key):
  1) In the client UI, choose “Få en generert nøkkel” and download the private key when shown (only once).
  2) Store the private key at `certs/private.pem` (or point `PRIVATE_KEY_PATH` to it) and set `KEY_ID` to the `kid` shown in the UI.
  3) Start the app; `/jwks` will expose the matching public key, but the client already has it from generation.

## Notes
- Uses `jose` for signing, verification, and JWKS generation; supply an RSA key (`-----BEGIN RSA PRIVATE KEY-----`).
- Use Bun as the default package manager;
- Never commit private keys or `.env`.
- `KEY_ID` is not secret but should be unique per key and environment; update it when rotating keys so JWKS/Maskinporten matches the right public key.
- If startup fails, verify env values and key path (check `/health` when running).
- If token exchange fails with `invalid_request`/MP-011, check: `AUDIENCE` matches your Maskinporten base (`https://test.maskinporten.no/` in test), `ISSUER` equals client ID, `kid` matches the registered key, and your system clock is correct (token iat/exp are tight).
