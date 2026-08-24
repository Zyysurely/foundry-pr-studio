import {
  listConnectionRepositories,
  toPublicRepository,
} from "../lib/github.js";
import { allowMethod, sendError, sendJson } from "../lib/http.js";
import { getSession } from "../lib/session.js";

export default async function handler(request, response) {
  if (!allowMethod(request, response, "GET")) {
    return;
  }

  try {
    const { config, session } = getSession(request);

    if (session.kind !== "connection") {
      const error = new Error("The GitHub connection is not complete.");
      error.statusCode = 409;
      throw error;
    }

    const repositories = await listConnectionRepositories(config, session);
    sendJson(response, 200, {
      repositories: repositories.map(toPublicRepository),
    });
  } catch (error) {
    sendError(response, error);
  }
}
