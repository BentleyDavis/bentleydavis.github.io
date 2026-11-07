const crypto = require("node:crypto");
const { onRequest } = require("firebase-functions/v2/https");

const CLIENT_ID = "muse";
const REDIRECT_URI = "https://agent.meta.ai/api/hatch/oauth/callback";
const PROJECT = "apps-5884f";
const CODE_LIFETIME = 5 * 60 * 1000;
const SESSION_LIFETIME = 90 * 24 * 60 * 60 * 1000;
const FIRESTORE_SCOPE = "firestore";

class OAuthError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.status = status;
  }
}

function randomToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("base64url");
}

function equal(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

function authorizationParameters(input) {
  if (input.client_id !== CLIENT_ID || input.redirect_uri !== REDIRECT_URI) {
    throw new OAuthError("invalid_request");
  }
  if (input.response_type !== "code") throw new OAuthError("unsupported_response_type");
  if (typeof input.state !== "string" || !input.state || input.state.length > 2048) {
    throw new OAuthError("invalid_request");
  }
  if (input.scope && input.scope !== FIRESTORE_SCOPE) throw new OAuthError("invalid_scope");
  if (input.code_challenge !== undefined || input.code_challenge_method !== undefined) {
    if (input.code_challenge_method !== "S256" ||
        typeof input.code_challenge !== "string" ||
        !/^[A-Za-z0-9_-]{43}$/.test(input.code_challenge)) {
      throw new OAuthError("invalid_request");
    }
  }
  return {
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    state: input.state,
    scope: FIRESTORE_SCOPE,
    ...(input.code_challenge ? {
      code_challenge: input.code_challenge,
      code_challenge_method: "S256",
    } : {}),
  };
}

function requireClient(req) {
  let id = req.body?.client_id;
  let secret = req.body?.client_secret;
  const authorization = req.get("authorization");
  if (authorization) {
    if (!authorization.startsWith("Basic ") || secret !== undefined) {
      throw new OAuthError("invalid_client", 401);
    }
    const decoded = Buffer.from(authorization.slice(6), "base64").toString("utf8");
    const colon = decoded.indexOf(":");
    if (colon < 0) throw new OAuthError("invalid_client", 401);
    try {
      id = decodeURIComponent(decoded.slice(0, colon).replace(/\+/g, " "));
      secret = decodeURIComponent(decoded.slice(colon + 1).replace(/\+/g, " "));
    } catch {
      throw new OAuthError("invalid_client", 401);
    }
  }
  if (id !== CLIENT_ID || !equal(secret, process.env.MUSE_OAUTH_CLIENT_SECRET)) {
    throw new OAuthError("invalid_client", 401);
  }
}

// Firebase refresh credentials are encrypted as well as being inaccessible to clients.
function encryptionKey() {
  return crypto.hkdfSync("sha256", process.env.MUSE_OAUTH_CLIENT_SECRET,
    PROJECT, "firebase-oauth-refresh-storage", 32);
}

function encrypt(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

function decrypt(value) {
  const bytes = Buffer.from(value, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8");
}

async function firebaseRequest(url, body, failureCode) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": body instanceof URLSearchParams
      ? "application/x-www-form-urlencoded" : "application/json" },
    body: body instanceof URLSearchParams ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
    redirect: "error",
  });
  if (!response.ok) {
    // Never log upstream responses: they may contain credentials or account details.
    await response.body?.cancel();
    throw new OAuthError(response.status >= 500 ? "temporarily_unavailable" : failureCode,
      response.status >= 500 ? 503 : 400);
  }
  return response.json();
}

function cookie(req, name) {
  const entry = (req.get("cookie") || "").split(";")
    .map(part => part.trim()).find(part => part.startsWith(`${name}=`));
  return entry ? entry.slice(name.length + 1) : "";
}

function signInPage(parameters, csrf) {
  const fields = Object.entries({ ...parameters, csrf })
    .map(([name, value]) => `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`)
    .join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Authorize Muse</title></head>
<body>
<h1>Authorize Muse</h1>
<p>Sign in with the Firebase account Muse should act as, not another administrator's account.</p>
<p>Muse will receive this account's access to the apps database, including membership
management if authorized. It can stay connected for up to 90 days. Your password is
used only to sign in and is not stored. Cancel by closing this page.</p>
<form method="post" action="authorize">
${fields}
<p><label>Email <input name="email" type="email" autocomplete="username" required maxlength="320"></label></p>
<p><label>Password <input name="password" type="password" autocomplete="current-password" required maxlength="4096"></label></p>
<button type="submit">Sign in and authorize Muse</button>
</form></body></html>`;
}

module.exports = function createOAuth(db) {
  const store = db.collection("_oauth");
  const ref = (kind, token) => {
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
      throw new OAuthError("invalid_grant");
    }
    return store.doc(`${kind}_${hash(token)}`);
  };
  const requireMember = async uid => {
    if (!(await db.collection("access").doc(uid).get()).exists) {
      throw new OAuthError("access_denied", 403);
    }
  };
  const saveSession = async (token, uid, firebaseRefreshToken, expiresAt) => {
    await ref("session", token).set({
      uid,
      clientId: CLIENT_ID,
      firebaseRefreshToken: encrypt(firebaseRefreshToken),
      expiresAt,
    });
  };

  return onRequest({
    region: "us-central1",
    secrets: ["MUSE_OAUTH_CLIENT_SECRET"],
    maxInstances: 5,
  }, async (req, res) => {
      res.set({
        "Cache-Control": "no-store",
        "Pragma": "no-cache",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      });
      try {
        if (!process.env.MUSE_OAUTH_CLIENT_SECRET || !process.env.FIREBASE_WEB_API_KEY) {
          throw new Error("Missing OAuth server configuration");
        }
        if (!["/authorize", "/token", "/revoke"].includes(req.path)) {
          return res.status(404).json({ error: "not_found" });
        }
        if (req.path === "/authorize" && req.method === "GET") {
          const parameters = authorizationParameters(req.query);
          const csrf = randomToken();
          res.cookie("__Host-muse-oauth", csrf, {
            httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: CODE_LIFETIME,
          });
          return res.type("html").send(signInPage(parameters, csrf));
        }
        if (req.method !== "POST") {
          res.set("Allow", req.path === "/authorize" ? "GET, POST" : "POST");
          return res.status(405).json({ error: "invalid_request" });
        }
        if (!req.body || typeof req.body !== "object" || Buffer.byteLength(JSON.stringify(req.body)) > 16384) {
          throw new OAuthError("invalid_request");
        }
        const apiKey = encodeURIComponent(process.env.FIREBASE_WEB_API_KEY);
        if (req.path === "/authorize") {
          const parameters = authorizationParameters(req.body);
          if (!equal(cookie(req, "__Host-muse-oauth"), req.body.csrf) ||
              typeof req.body.csrf !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(req.body.csrf)) {
            throw new OAuthError("invalid_request");
          }
          if (typeof req.body.email !== "string" || req.body.email.length > 320 ||
              typeof req.body.password !== "string" || !req.body.password ||
              req.body.password.length > 4096) throw new OAuthError("invalid_request");
          const signedIn = await firebaseRequest(
            `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
            { email: req.body.email, password: req.body.password, returnSecureToken: true },
            "access_denied");
          if (!signedIn.localId || !signedIn.refreshToken) throw new Error("Invalid sign-in response");
          await requireMember(signedIn.localId);
          const code = randomToken();
          await ref("code", code).create({
            uid: signedIn.localId,
            clientId: CLIENT_ID,
            redirectUri: REDIRECT_URI,
            challenge: parameters.code_challenge || null,
            firebaseRefreshToken: encrypt(signedIn.refreshToken),
            expiresAt: Date.now() + CODE_LIFETIME,
          });
          res.clearCookie("__Host-muse-oauth", { secure: true, sameSite: "lax", path: "/" });
          const redirect = new URL(REDIRECT_URI);
          redirect.searchParams.set("code", code);
          redirect.searchParams.set("state", parameters.state);
          return res.type("html").send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Continue to Muse</title></head><body>
<h1>Authorization approved</h1>
<p><a href="${escapeHtml(redirect.toString())}">Continue to Muse</a>
to finish connecting. This link expires in five minutes.</p>
</body></html>`);
        }

        requireClient(req);
        if (req.path === "/revoke") {
          // Unknown tokens also return success, as required by OAuth revocation.
          if (typeof req.body.token === "string" && /^[A-Za-z0-9_-]{43}$/.test(req.body.token)) {
            await ref("session", req.body.token).delete();
          }
          return res.status(200).send("");
        }
        let grant;
        let refreshToken;
        let expiresAt;
        if (req.body.grant_type === "authorization_code") {
          if (req.body.redirect_uri !== REDIRECT_URI) throw new OAuthError("invalid_grant");
          const codeRef = ref("code", req.body.code);
          grant = await db.runTransaction(async transaction => {
            const snapshot = await transaction.get(codeRef);
            const data = snapshot.data();
            if (!data || data.clientId !== CLIENT_ID || data.redirectUri !== REDIRECT_URI ||
                data.expiresAt <= Date.now()) throw new OAuthError("invalid_grant");
            if (data.challenge && (typeof req.body.code_verifier !== "string" ||
                !/^[A-Za-z0-9._~-]{43,128}$/.test(req.body.code_verifier) ||
                !equal(hash(req.body.code_verifier), data.challenge))) {
              throw new OAuthError("invalid_grant");
            }
            transaction.delete(codeRef);
            return data;
          });
          refreshToken = randomToken();
          expiresAt = Date.now() + SESSION_LIFETIME;
        } else if (req.body.grant_type === "refresh_token") {
          refreshToken = req.body.refresh_token;
          grant = (await ref("session", refreshToken).get()).data();
          if (!grant || grant.clientId !== CLIENT_ID || grant.expiresAt <= Date.now()) {
            throw new OAuthError("invalid_grant");
          }
          expiresAt = grant.expiresAt;
        } else {
          throw new OAuthError("unsupported_grant_type");
        }
        await requireMember(grant.uid);
        const refreshed = await firebaseRequest(
          `https://securetoken.googleapis.com/v1/token?key=${apiKey}`,
          new URLSearchParams({ grant_type: "refresh_token", refresh_token: decrypt(grant.firebaseRefreshToken) }),
          "invalid_grant");
        if (refreshed.user_id !== grant.uid || refreshed.project_id !== "802105454064" ||
            typeof refreshed.id_token !== "string" || !refreshed.refresh_token ||
            !(Number(refreshed.expires_in) > 0)) throw new Error("Invalid refresh response");
        await saveSession(refreshToken, grant.uid, refreshed.refresh_token, expiresAt);
        return res.json({
          access_token: refreshed.id_token,
          token_type: "Bearer",
          expires_in: Number(refreshed.expires_in),
          refresh_token: refreshToken,
          scope: FIRESTORE_SCOPE,
        });
      } catch (err) {
        if (err instanceof OAuthError) {
          if (err.status === 401) res.set("WWW-Authenticate", 'Basic realm="muse-oauth"');
          return res.status(err.status).json({ error: err.message });
        }
        console.error("OAuth request failed", { code: typeof err.code === "number" ? err.code : "internal" });
        return res.status(500).json({ error: "server_error" });
      }
    });
};
