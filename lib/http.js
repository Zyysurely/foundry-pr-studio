export function allowMethod(request, response, method) {
  if (request.method === method) {
    return true;
  }

  response.setHeader("Allow", method);
  sendJson(response, 405, { error: "Method not allowed." });
  return false;
}

export function getJsonBody(request) {
  if (request.body && typeof request.body === "object") {
    return request.body;
  }

  if (typeof request.body === "string" && request.body.length > 0) {
    return JSON.parse(request.body);
  }

  return {};
}

export function requireString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    const error = new Error(`${label} is required.`);
    error.statusCode = 400;
    throw error;
  }

  return value.trim();
}

export function sendJson(response, statusCode, body) {
  response.setHeader("Cache-Control", "no-store");
  response.status(statusCode).json(body);
}

export function sendError(response, error) {
  const statusCode =
    error instanceof Error && Number.isInteger(error.statusCode)
      ? error.statusCode
      : 500;
  const message = error instanceof Error ? error.message : "Unexpected server error.";
  sendJson(response, statusCode, { error: message });
}
