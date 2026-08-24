import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";

import handler from "../api/oauth/start.js";
import { unsealData } from "../lib/sealed-data.js";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privateKeyPem = privateKey.export({
  type: "pkcs8",
  format: "pem",
});

process.env.GITHUB_APP_CLIENT_SECRET = "test-client-secret";
process.env.GITHUB_APP_PRIVATE_KEY_B64 = Buffer.from(privateKeyPem).toString("base64");
process.env.SESSION_SECRET = "test-session-secret-that-is-at-least-32-characters";
process.env.APP_ORIGIN = "https://foundry-pr-studio.example";

test("OAuth start creates a signed PKCE authorization URL", async () => {
  const request = {
    method: "POST",
    body: {
      authMode: "installation",
      project: {
        projectName: "foundry-test-123",
        projectEndpoint:
          "https://foundry-test-123.services.ai.azure.com/api/projects/foundry-test-123",
        connectionName: "github-test-123",
      },
    },
    headers: {},
    socket: {},
  };
  const response = createResponse();

  await handler(request, response);

  assert.equal(response.statusCode, 200);
  const authorizeUrl = new URL(response.body.authorizeUrl);
  assert.equal(authorizeUrl.origin, "https://github.com");
  assert.equal(
    authorizeUrl.searchParams.get("redirect_uri"),
    "https://foundry-pr-studio.example/callback.html",
  );
  assert.equal(authorizeUrl.searchParams.get("code_challenge_method"), "S256");

  const state = unsealData(
    authorizeUrl.searchParams.get("state"),
    process.env.SESSION_SECRET,
  );
  assert.equal(state.kind, "oauth-state");
  assert.equal(state.authMode, "installation");
  assert.equal(state.project.projectName, "foundry-test-123");
  assert.ok(state.verifier.length >= 43);
});

function createResponse() {
  return {
    headers: {},
    statusCode: null,
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}
