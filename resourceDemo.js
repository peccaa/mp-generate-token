const express = require("express");
const createError = require("http-errors");

// Builds a router that validates Maskinporten access tokens and exposes a demo endpoint.
const createDemoResourceRouter = async ({ audience, expectedScope, resourceAudience }) => {
  const { jwtVerify, createRemoteJWKSet } = await import("jose");
  const router = express.Router();

  const maskinportenBase = audience.replace(/\/$/, "");
  const jwksUrl = `${maskinportenBase}/jwk`;
  const remoteJwks = createRemoteJWKSet(new URL(jwksUrl));

  const requireAccessToken = async (req, res, next) => {
    const auth = req.headers.authorization || "";
    const [scheme, token] = auth.split(" ");
    if (!token || scheme.toLowerCase() !== "bearer") {
      return next(createError(401, "Mangler bearer token"));
    }

    try {
      const verifyOptions = {
        issuer: audience,
        maxTokenAge: "5m",
      };
      if (resourceAudience) {
        verifyOptions.audience = resourceAudience;
      }

      const { payload } = await jwtVerify(token, remoteJwks, verifyOptions);
      const scopes = `${payload.scope || ""}`.split(" ");
      if (expectedScope && !scopes.includes(expectedScope)) {
        return next(createError(403, "Ugyldig scope"));
      }

      req.tokenPayload = payload;
      next();
    } catch (err) {
      next(createError(401, "Ugyldig eller utløpt token"));
    }
  };

  router.get("/demo_api", requireAccessToken, (req, res) => {
    res.json({
      message: "Maskinporten resource ok",
      scope: req.tokenPayload.scope,
      consumer: req.tokenPayload.consumer,
      client_id: req.tokenPayload.client_id,
    });
  });

  return { router, jwksUrl };
};

module.exports = { createDemoResourceRouter };
