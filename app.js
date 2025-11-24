const express = require("express");
const createError = require("http-errors");
const path = require("path");
const fs = require("fs");
const { randomUUID, createPrivateKey, createPublicKey } = require("crypto");
require("dotenv").config();

const requiredEnv = ["ISSUER", "AUDIENCE", "SCOPE", "CONSUMER"];
const defaultKeyId = "c57c9c6d-65df-4203-8364-89601f336f3a";

const loadConfig = () => {
  const missing = requiredEnv.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  const privateKeyPath =
    process.env.PRIVATE_KEY_PATH || path.join(__dirname, "certs", "private.pem");
  if (!fs.existsSync(privateKeyPath)) {
    throw new Error(`Private key not found at ${privateKeyPath}`);
  }

  return {
    issuer: process.env.ISSUER,
    audience: process.env.AUDIENCE,
    scope: process.env.SCOPE,
    consumer: process.env.CONSUMER,
    privateKeyPath,
    keyId: process.env.KEY_ID || defaultKeyId,
    port: process.env.PORT || 4000,
    resourceAudience: process.env.API_AUDIENCE,
  };
};

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error("[startup] Configuration error:", err.message);
  process.exit(1);
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static("public"));

let signingKey;
let signingJwk;
let keyFormat = "unknown";
let exportJWK;
let SignJWT;
const { createDemoResourceRouter } = require("./resourceDemo");

const createAssertion = async () =>
  new SignJWT({
    jti: randomUUID(),
    scope: config.scope,
    consumer_org: config.consumer,
  })
    .setProtectedHeader({ alg: "RS256", kid: config.keyId })
    .setIssuer(config.issuer)
    .setAudience(config.audience)
    .setIssuedAt()
    .setNotBefore("0s")
    .setExpirationTime("120s")
    .sign(signingKey);

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    keyLoaded: Boolean(signingKey),
    kid: config.keyId,
    keyFormat,
    audience: config.audience,
    resourceAudience: config.resourceAudience,
  });
});

// Genererer JSON WEB KEY SETS som skal brukes i selvebetjeningsportalen
app.get("/jwks", async (req, res, next) => {
  try {
    res.jsonp([signingJwk]);
  } catch (err) {
    next(createError(500, "Kunne ikke generere JWKS"));
  }
});

// Genererer nøkkelen som skal brukes til å hente accessToken som gir tilgang til API
app.get("/jwt_token", async (req, res, next) => {
  try {
    const token = await createAssertion();
    res.send({ jwt_token: token });
  } catch (err) {
    next(createError(500, "Kunne ikke generere JWT"));
  }
});

// Bytter assertion inn i et access token mot Maskinporten
app.post("/access_token", async (req, res, next) => {
  try {
    const assertion = await createAssertion();
    const tokenUrl = `${config.audience.replace(/\/$/, "")}/token`;

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      return next(
        createError(response.status, body.error_description || "Kunne ikke hente access token")
      );
    }

    return res.json(body);
  } catch (err) {
      console.log(err)
    next(createError(500, "Kunne ikke hente access token"));
  }
});

const start = async () => {
  try {
    ({ exportJWK, SignJWT } = await import("jose"));

    const pem = fs.readFileSync(config.privateKeyPath, "utf-8");
    const isPkcs1 = pem.includes("BEGIN RSA PRIVATE KEY");
    keyFormat = isPkcs1 ? "PKCS#1" : "PKCS#8";

    signingKey = createPrivateKey(pem);
    const publicKey = createPublicKey(signingKey);

    signingJwk = await exportJWK(publicKey);
    signingJwk.use = "sig";
    signingJwk.alg = "RS256";
    signingJwk.kid = config.keyId;

    const { router: demoRouter, jwksUrl } = await createDemoResourceRouter({
      audience: config.audience,
      expectedScope: config.scope,
      resourceAudience: config.resourceAudience,
    });

    app.use(demoRouter);

    app.use((req, res, next) => {
      next(createError.NotFound());
    });

    app.use((err, req, res, next) => {
      res.status(err.status || 500);
      res.send({
        status: err.status || 500,
        message: err.message,
      });
    });

    app.listen(config.port, () =>
      console.log(
        `http://localhost:${config.port} (kid=${config.keyId}, key=${config.privateKeyPath}, format=${keyFormat}, jwk=${jwksUrl})`
      )
    );
  } catch (err) {
    console.error("[startup] Key load error:", err.message);
    process.exit(1);
  }
};

start();
