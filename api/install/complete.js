import {
  listUserInstallations,
} from "../../lib/github.js";
import {
  allowMethod,
  getJsonBody,
  requireString,
  sendError,
  sendJson,
} from "../../lib/http.js";
import {
  getSession,
  setConnectionSession,
  toPublicConnection,
} from "../../lib/session.js";
import {
  assertNotExpired,
  unsealData,
} from "../../lib/sealed-data.js";

export default async function handler(request, response) {
  if (!allowMethod(request, response, "POST")) {
    return;
  }

  try {
    const body = getJsonBody(request);
    const installationId = requireString(
      body.installationId,
      "Installation ID",
    );
    const sealedState = requireString(body.state, "Installation state");
    const { config, session } = getSession(request);

    if (session.kind !== "temporary" || !session.installNonce) {
      const error = new Error("The GitHub installation session expired.");
      error.statusCode = 401;
      throw error;
    }

    const state = unsealData(sealedState, config.sessionSecret);
    assertNotExpired(state);

    if (
      state.kind !== "install-state"
      || state.nonce !== session.installNonce
    ) {
      const error = new Error("The GitHub installation state is invalid.");
      error.statusCode = 401;
      throw error;
    }

    const installations = await listUserInstallations(
      config,
      session.userAccessToken,
    );
    const installation = installations.find(
      (candidate) => String(candidate.id) === installationId,
    );

    if (!installation) {
      const error = new Error(
        "The authorized GitHub user cannot access this installation.",
      );
      error.statusCode = 403;
      throw error;
    }

    const connectionSession = setConnectionSession(
      response,
      config,
      session,
      installation,
    );
    sendJson(response, 200, {
      status: "connected",
      connection: toPublicConnection(connectionSession),
    });
  } catch (error) {
    sendError(response, error);
  }
}
