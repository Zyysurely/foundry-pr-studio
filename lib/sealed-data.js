import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const VERSION = "v1";

export function sealData(value, secret) {
  const key = createHash("sha256").update(secret).digest();
  const initializationVector = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, initializationVector);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authenticationTag = cipher.getAuthTag();

  return [
    VERSION,
    initializationVector.toString("base64url"),
    authenticationTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function unsealData(token, secret) {
  if (typeof token !== "string") {
    throw createInvalidTokenError();
  }

  const [version, initializationVectorValue, authenticationTagValue, ciphertextValue] =
    token.split(".");

  if (
    version !== VERSION
    || !initializationVectorValue
    || !authenticationTagValue
    || !ciphertextValue
  ) {
    throw createInvalidTokenError();
  }

  try {
    const key = createHash("sha256").update(secret).digest();
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(initializationVectorValue, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(authenticationTagValue, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextValue, "base64url")),
      decipher.final(),
    ]);
    return JSON.parse(plaintext.toString("utf8"));
  } catch {
    throw createInvalidTokenError();
  }
}

export function assertNotExpired(value) {
  if (!value?.expiresAt || value.expiresAt <= Date.now()) {
    const error = new Error("The GitHub connection session expired. Start again.");
    error.statusCode = 401;
    throw error;
  }
}

function createInvalidTokenError() {
  const error = new Error("The GitHub connection state is invalid.");
  error.statusCode = 401;
  return error;
}
