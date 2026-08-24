import { getSecretConfig } from "./config.js";
import {
  SESSION_COOKIE_NAME,
  getCookie,
  setSessionCookie,
} from "./cookies.js";
import { assertNotExpired, sealData, unsealData } from "./sealed-data.js";

const SESSION_DURATION_MS = 60 * 60 * 1000;

export function getSession(request) {
  const config = getSecretConfig(request);
  const sealedSession = getCookie(request, SESSION_COOKIE_NAME);

  if (!sealedSession) {
    const error = new Error("No active GitHub connection was found.");
    error.statusCode = 401;
    throw error;
  }

  const session = unsealData(sealedSession, config.sessionSecret);
  assertNotExpired(session);
  return { config, session };
}

export function setTemporarySession(response, config, values) {
  const session = {
    kind: "temporary",
    ...values,
    expiresAt: Date.now() + SESSION_DURATION_MS,
  };
  setSessionCookie(
    response,
    sealData(session, config.sessionSecret),
    config.origin,
  );
  return session;
}

export function setConnectionSession(response, config, temporarySession, installation) {
  const session = {
    kind: "connection",
    authMode: temporarySession.authMode,
    project: temporarySession.project,
    installationId: String(installation.id),
    accountLogin: installation.account?.login ?? "unknown-account",
    accountType: installation.account?.type ?? "Unknown",
    repositorySelection: installation.repository_selection ?? "selected",
    userAccessToken:
      temporarySession.authMode === "oauth"
        ? temporarySession.userAccessToken
        : null,
    expiresAt: Date.now() + SESSION_DURATION_MS,
  };
  setSessionCookie(
    response,
    sealData(session, config.sessionSecret),
    config.origin,
  );
  return session;
}

export function toPublicConnection(session) {
  return {
    authMode: session.authMode,
    oauthAuthorized: true,
    installationId: session.installationId,
    accountLogin: session.accountLogin,
    accountType: session.accountType,
    repositorySelection: session.repositorySelection,
    repositoryLabel: `${session.accountLogin} · ${session.repositorySelection} repositories`,
    projectName: session.project.projectName,
    projectEndpoint: session.project.projectEndpoint,
    connectionName: session.project.connectionName,
  };
}
