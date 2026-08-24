import { isProductionOrigin } from "./config.js";

export const SESSION_COOKIE_NAME = "foundry_pr_studio_session";

export function getCookie(request, name) {
  const rawCookie = request.headers.cookie;

  if (!rawCookie) {
    return null;
  }

  const cookie = rawCookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));

  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : null;
}

export function setSessionCookie(response, value, origin, maxAgeSeconds = 3600) {
  const attributes = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];

  if (isProductionOrigin(origin)) {
    attributes.push("Secure");
  }

  response.setHeader("Set-Cookie", attributes.join("; "));
}

export function clearSessionCookie(response, origin) {
  setSessionCookie(response, "", origin, 0);
}
