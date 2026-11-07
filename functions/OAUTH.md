# Muse OAuth connection

This is an OAuth 2.0 authorization-code adapter, not a Firestore relay.
The platform exchanges codes and refresh tokens privately and sends the returned
Firebase ID token directly to Firestore. Helper code must never call the token
endpoint or expose its responses to the AI.

## Connector settings

- Authorization URL:
  `https://museoauthv2-trsmkdyvea-uc.a.run.app/authorize`
- Token URL:
  `https://museoauthv2-trsmkdyvea-uc.a.run.app/token`
- Revocation URL (optional):
  `https://museoauthv2-trsmkdyvea-uc.a.run.app/revoke`
- Client ID: `muse`
- Client secret: retrieve `MUSE_OAUTH_CLIENT_SECRET` from Google Secret Manager
  using a trusted administrator and enter it only in the platform's secure
  connector setup. Never put it in a helper, source, chat, or logs.
- Grant: authorization code, with refresh-token support.
- Callback: `https://agent.meta.ai/api/hatch/oauth/callback` (exact match).
- Scope: `firestore`.
- Authorization parameter: `access_type=offline` (accepted; refresh tokens are
  always returned by this adapter).
- Token authentication: `client_secret_basic` preferred;
  `client_secret_post` is also supported for the platform's own exchanges.
- PKCE: S256 supported; recommended when the platform supports it.
- API host: `firestore.googleapis.com`.
- OAuth host: the host of the deployed `museOAuthV2` URL (`*.run.app`).
- API authentication: `Authorization: Bearer <platform-managed access token>`.

The existing password/API-key connector is not used for this flow. Configure an
OAuth connection through the platform's standard OAuth setup, not a helper that
manually parses token responses.

During connection, sign in with the Firebase account Muse should act as.
After approving, click "Continue to Muse" to finish the callback. This explicit
link avoids browser CSP restrictions on redirects following form submissions.
Authorizing a different account gives Muse that account's permissions. The page
currently supports email/password sign-in, not Google sign-in or MFA.
Only accounts with an `access/{UID}` membership can authorize or refresh.
The browser password is used for Firebase sign-in only and is never stored.

## REST operations

Use the platform-managed bearer token with the named database:

```text
https://firestore.googleapis.com/v1/projects/apps-5884f/databases/apps/documents
```

Firestore security rules apply normally. No Admin SDK is used to execute these
data requests. OAuth scope is a connector label, not a replacement for the
Firestore access rules.

## Server management

- Deploy only `functions:museOAuthV2`; do not redeploy other functions as a side effect.
- Runtime environment requires `FIREBASE_WEB_API_KEY` from this Firebase project.
  The web API key identifies the project and is not an administrator credential.
- Bind Secret Manager secret `MUSE_OAUTH_CLIENT_SECRET` to the function and grant
  only its runtime service account access to that secret.
- Deploy the approved rules excluding `_oauth` from all client reads/writes
  **before** enabling this function.
- `_oauth` stores hashed authorization-code/refresh-token identifiers and
  AES-256-GCM-encrypted Firebase refresh credentials. Encryption uses a key
  derived from the client secret. Do not copy these documents into source or
  logs. Server IAM access must remain restricted to trusted administrators.
- Codes expire after five minutes and are consumed atomically. Sessions expire
  after 90 days; refresh does not extend that lifetime. Expired records are
  rejected but are not automatically removed by this implementation.
- Rotating the client secret invalidates existing connections; reconnect after
  entering the new secret in the platform.
- Revocation deletes an adapter refresh session. Previously issued Firebase ID
  tokens may remain valid for roughly one hour; removing database membership
  blocks Firestore access independently of token expiry.
- Responses use `no-store`. Never log request bodies, authorization headers,
  cookies, codes, or tokens. Firebase errors are deliberately sanitized.

No automatic connector registration, arbitrary callbacks, implicit grants,
password grants, OpenID Connect discovery, or arbitrary target projects are
supported.
