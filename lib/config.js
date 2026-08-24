import { createPrivateKey } from "node:crypto";

const DEFAULT_APP_ID = 4697962;
const DEFAULT_APP_SLUG = "zyying-public-app";
const DEFAULT_CLIENT_ID = "Iv23li7kYQDeh3p84NCg";

export function getPublicConfig(request) {
  return {
    appId: getInteger("GITHUB_APP_ID", DEFAULT_APP_ID),
    appSlug: process.env.GITHUB_APP_SLUG || DEFAULT_APP_SLUG,
    clientId: process.env.GITHUB_APP_CLIENT_ID || DEFAULT_CLIENT_ID,
    origin: getRequestOrigin(request),
  };
}

export function getSecretConfig(request) {
  const publicConfig = getPublicConfig(request);
  const clientSecret = requireEnvironmentVariable("GITHUB_APP_CLIENT_SECRET");
  const privateKeyBase64 = requireEnvironmentVariable("GITHUB_APP_PRIVATE_KEY_B64");
  const sessionSecret = requireEnvironmentVariable("SESSION_SECRET");

  if (sessionSecret.length < 32) {
    throw createConfigurationError("SESSION_SECRET must contain at least 32 characters.");
  }

  let privateKey;

  try {
    privateKey = createPrivateKey(
      Buffer.from(privateKeyBase64, "base64").toString("utf8"),
    );
  } catch {
    throw createConfigurationError(
      "GITHUB_APP_PRIVATE_KEY_B64 is not a valid base64-encoded GitHub App private key.",
    );
  }

  return {
    ...publicConfig,
    callbackUrl: `${publicConfig.origin}/callback.html`,
    clientSecret,
    privateKey,
    sessionSecret,
  };
}

export function getRequestOrigin(request) {
  if (process.env.APP_ORIGIN) {
    return process.env.APP_ORIGIN.replace(/\/+$/, "");
  }

  const forwardedProtocol = getFirstHeader(request.headers["x-forwarded-proto"]);
  const forwardedHost = getFirstHeader(request.headers["x-forwarded-host"]);
  const protocol = forwardedProtocol || (request.socket?.encrypted ? "https" : "http");
  const host = forwardedHost || request.headers.host;

  if (!host) {
    throw createConfigurationError("Unable to determine the application origin.");
  }

  return `${protocol}://${host}`;
}

export function isProductionOrigin(origin) {
  return origin.startsWith("https://");
}

function getInteger(name, fallbackValue) {
  const rawValue = process.env[name];

  if (!rawValue) {
    return fallbackValue;
  }

  const parsedValue = Number.parseInt(rawValue, 10);

  if (!Number.isSafeInteger(parsedValue)) {
    throw createConfigurationError(`${name} must be an integer.`);
  }

  return parsedValue;
}

function requireEnvironmentVariable(name) {
  const value = process.env[name];

  if (!value) {
    throw createConfigurationError(`${name} is not configured.`);
  }

  return value;
}

function getFirstHeader(value) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value?.split(",")[0]?.trim();
}

function createConfigurationError(message) {
  const error = new Error(message);
  error.statusCode = 503;
  return error;
}
