import { getSecretConfig } from "../../lib/config.js";
import {
  createOAuthAuthorizeUrl,
  createPkcePair,
} from "../../lib/github.js";
import {
  allowMethod,
  getJsonBody,
  requireString,
  sendError,
  sendJson,
} from "../../lib/http.js";
import { sealData } from "../../lib/sealed-data.js";

export default function handler(request, response) {
  if (!allowMethod(request, response, "POST")) {
    return;
  }

  try {
    const config = getSecretConfig(request);
    const body = getJsonBody(request);
    const authMode = requireString(body.authMode, "Authorization mode");
    const project = validateProject(body.project);

    if (authMode !== "installation" && authMode !== "oauth") {
      const error = new Error("Unsupported authorization mode.");
      error.statusCode = 400;
      throw error;
    }

    const pkce = createPkcePair();
    const state = sealData(
      {
        kind: "oauth-state",
        authMode,
        project,
        verifier: pkce.verifier,
        expiresAt: Date.now() + 10 * 60 * 1000,
      },
      config.sessionSecret,
    );
    sendJson(response, 200, {
      authorizeUrl: createOAuthAuthorizeUrl(config, state, pkce.challenge),
    });
  } catch (error) {
    sendError(response, error);
  }
}

function validateProject(project) {
  if (
    !project
    || typeof project !== "object"
    || typeof project.projectName !== "string"
    || typeof project.projectEndpoint !== "string"
    || typeof project.connectionName !== "string"
  ) {
    const error = new Error("Generated Foundry project metadata is invalid.");
    error.statusCode = 400;
    throw error;
  }

  return {
    projectName: project.projectName,
    projectEndpoint: project.projectEndpoint,
    connectionName: project.connectionName,
  };
}
