import { clearSessionCookie } from "../lib/cookies.js";
import { sendError, sendJson } from "../lib/http.js";
import {
  getSession,
  toPublicConnection,
} from "../lib/session.js";

export default function handler(request, response) {
  try {
    const { config, session } = getSession(request);

    if (request.method === "DELETE") {
      clearSessionCookie(response, config.origin);
      sendJson(response, 200, { status: "cleared" });
      return;
    }

    if (request.method !== "GET") {
      response.setHeader("Allow", "GET, DELETE");
      sendJson(response, 405, { error: "Method not allowed." });
      return;
    }

    if (session.kind !== "connection") {
      const error = new Error("The GitHub connection is not complete.");
      error.statusCode = 409;
      throw error;
    }

    sendJson(response, 200, {
      connection: toPublicConnection(session),
    });
  } catch (error) {
    sendError(response, error);
  }
}
