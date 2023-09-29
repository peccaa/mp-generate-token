const express = require("express");
const createError = require("http-errors");
const morgan = require("morgan");
const JWT = require("jsonwebtoken");
const fs = require("fs");
const { randomUUID } = require("crypto");
const rsaPemToJwk = require("rsa-pem-to-jwk");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(morgan("dev"));
app.use(express.static("public"));

// ssh-keygen -t rsa -b 2048 -m PEM -f private.pem - WORKING!!!!
// openssl genrsa -out private.pem 3072 - NOT WORKING !!!
// openssl rsa -in private.key -pubout > public.key
const privateKey = fs.readFileSync("./certs/private.pem", "utf-8");

const keyIdentifier = "c57c9c6d-65df-4203-8364-89601f336f3a";

const signOptions = {
  issuer: process.env.ISSUER,
  audience: process.env.AUDIENCE,
  expiresIn: "120s",
  algorithm: "RS256",
  keyid: keyIdentifier,
};

// Genererer JSON WEB KEY SETS som skal brukes i selvebetjeningsportalen
app.get("/jwks", async (req, res, next) => {
  const jwk = rsaPemToJwk(
    privateKey,
    { kid: keyIdentifier, alg: "RS256", use: "sig" },
    "public"
  );

  console.log(jwk)

  res.jsonp([jwk]);
});

// Genererer nøkkelen som skal brukes til å hente accessToken som gir tilgang til API
app.get("/jwt_token", async (req, res, next) => {
  const token = JWT.sign(
    {
      jti: randomUUID(),
      scope: process.env.SCOPE,
      consumer_org: process.env.CONSUMER,
    },
    privateKey,
    signOptions
  );

  res.send({ jwt_token: token });
});

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

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 @ http://localhost:${PORT}`));
