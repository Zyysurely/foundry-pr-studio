import { getPublicConfig } from "../lib/config.js";
import { allowMethod, sendError, sendJson } from "../lib/http.js";

export default function handler(request, response) {
  if (!allowMethod(request, response, "GET")) {
    return;
  }

  try {
    const config = getPublicConfig(request);
    sendJson(response, 200, {
      status: "ok",
      appSlug: config.appSlug,
      origin: config.origin,
      configured: Boolean(
        process.env.GITHUB_APP_CLIENT_SECRET
        && process.env.GITHUB_APP_PRIVATE_KEY_B64
        && process.env.SESSION_SECRET,
      ),
    });
  } catch (error) {
    sendError(response, error);
  }
}
