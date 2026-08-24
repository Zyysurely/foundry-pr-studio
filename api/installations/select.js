import { listUserInstallations } from "../../lib/github.js";
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
    const { config, session } = getSession(request);

    if (session.kind !== "temporary") {
      const error = new Error("The installation selection session expired.");
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
        "That GitHub App installation is not available to this user.",
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
