import {
  createPullRequest,
  resolveRepository,
} from "../lib/github.js";
import {
  allowMethod,
  getJsonBody,
  requireString,
  sendError,
  sendJson,
} from "../lib/http.js";
import { getSession } from "../lib/session.js";
import { getRandomPullRequestTemplate } from "../lib/templates.js";

export default async function handler(request, response) {
  if (!allowMethod(request, response, "POST")) {
    return;
  }

  try {
    const body = getJsonBody(request);
    const repositoryFullName = requireString(body.repository, "Repository");
    const { config, session } = getSession(request);

    if (session.kind !== "connection") {
      const error = new Error("The GitHub connection is not complete.");
      error.statusCode = 409;
      throw error;
    }

    const repository = await resolveRepository(
      config,
      session,
      repositoryFullName,
    );
    const result = await createPullRequest(
      config,
      session,
      repository,
      getRandomPullRequestTemplate(),
    );
    sendJson(response, 201, result);
  } catch (error) {
    sendError(response, error);
  }
}
