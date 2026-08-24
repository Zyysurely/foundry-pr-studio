import { randomBytes } from "node:crypto";

import { getSecretConfig } from "../../lib/config.js";
import {
  createInstallationUrl,
  exchangeOAuthCode,
  listUserInstallations,
  toPublicInstallation,
} from "../../lib/github.js";
import {
  allowMethod,
  getJsonBody,
  requireString,
  sendError,
  sendJson,
} from "../../lib/http.js";
import {
  setConnectionSession,
  setTemporarySession,
  toPublicConnection,
} from "../../lib/session.js";
import {
  assertNotExpired,
  sealData,
  unsealData,
} from "../../lib/sealed-data.js";

export default async function handler(request, response) {
  if (!allowMethod(request, response, "POST")) {
    return;
  }

  try {
    const config = getSecretConfig(request);
    const body = getJsonBody(request);
    const code = requireString(body.code, "OAuth code");
    const sealedState = requireString(body.state, "OAuth state");
    const state = unsealData(sealedState, config.sessionSecret);
    assertNotExpired(state);

    if (state.kind !== "oauth-state") {
      const error = new Error("The GitHub OAuth state is invalid.");
      error.statusCode = 401;
      throw error;
    }

    const userAccessToken = await exchangeOAuthCode(
      config,
      code,
      state.verifier,
    );
    const installations = await listUserInstallations(
      config,
      userAccessToken,
    );
    const temporaryValues = {
      authMode: state.authMode,
      project: state.project,
      userAccessToken,
    };

    if (installations.length === 1) {
      const session = setConnectionSession(
        response,
        config,
        temporaryValues,
        installations[0],
      );
      sendJson(response, 200, {
        status: "connected",
        connection: toPublicConnection(session),
      });
      return;
    }

    if (installations.length > 1) {
      setTemporarySession(response, config, temporaryValues);
      sendJson(response, 200, {
        status: "choose_installation",
        installations: installations.map(toPublicInstallation),
      });
      return;
    }

    const installNonce = randomBytes(18).toString("base64url");
    setTemporarySession(response, config, {
      ...temporaryValues,
      installNonce,
    });
    const installState = sealData(
      {
        kind: "install-state",
        nonce: installNonce,
        expiresAt: Date.now() + 10 * 60 * 1000,
      },
      config.sessionSecret,
    );
    sendJson(response, 200, {
      status: "install_required",
      installationUrl: createInstallationUrl(config, installState),
    });
  } catch (error) {
    sendError(response, error);
  }
}
