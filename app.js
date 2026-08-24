"use strict";

const STORAGE_KEYS = Object.freeze({
  connection: "foundry-pr-studio.connection.v3",
  project: "foundry-pr-studio.project.v3",
  result: "foundry-pr-studio.result.v3",
});

const CHANNEL_NAME = "foundry-pr-studio.connection.v3";
const MESSAGE_TYPE = "foundry-pr-studio-connection";
const PROJECT_WORDS = Object.freeze([
  "aurora", "cobalt", "ember", "harbor", "lumen", "nova", "orbit", "quartz",
]);

document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.dataset.page;

  if (page === "setup") {
    initializeSetupPage();
  } else if (page === "callback") {
    initializeCallbackPage();
  } else if (page === "tests") {
    initializeTestsPage();
  }
});

function initializeSetupPage() {
  const form = required("connection-form");
  const startButton = required("start-connection");
  const closePopupButton = required("close-popup");
  const popupControls = required("popup-controls");
  const errorElement = required("form-error");
  const project = createRandomProject();
  const callbackUrl = `${window.location.origin}/callback.html`;
  const cachedConnection = readStorage(STORAGE_KEYS.connection);
  let popup = null;
  let popupTimer = 0;
  let waiting = false;
  const channel = "BroadcastChannel" in window ? new BroadcastChannel(CHANNEL_NAME) : null;

  writeStorage(STORAGE_KEYS.project, project);
  text("project-name", project.projectName);
  text("callback-url", callbackUrl);
  text("setup-url", callbackUrl);

  if (cachedConnection) {
    required("cached-alert").hidden = false;
    text(
      "cached-detail",
      `${cachedConnection.accountLogin} · installation ${cachedConnection.installationId}`,
    );
  }

  void checkHealth();

  async function checkHealth() {
    try {
      const health = await getJson("/api/health");
      const configured = Boolean(health.configured);
      setRuntimeStatus(
        configured ? "Backend ready" : "Secrets not configured",
        configured ? "success" : "warning",
      );
      startButton.disabled = !configured;

      if (!configured) {
        showError(
          errorElement,
          "Configure the Vercel environment variables before connecting GitHub.",
        );
      }
    } catch (error) {
      setRuntimeStatus("Backend unavailable", "warning");
      showError(errorElement, messageOf(error));
    }
  }

  function handleResult(result) {
    if (!isConnectionMessage(result) || !waiting) {
      return;
    }

    waiting = false;
    window.clearInterval(popupTimer);
    popupControls.hidden = true;

    if (result.status === "error") {
      startButton.disabled = false;
      setConnectionStatus("Stopped", "warning");
      showError(errorElement, result.message);
      return;
    }

    writeStorage(STORAGE_KEYS.connection, result.connection);
    removeStorage(STORAGE_KEYS.result);
    setConnectionStatus(`Connected · ${result.connection.installationId}`, "success");
    showToast("GitHub connection completed.");
    window.setTimeout(() => window.location.assign("chat.html"), 450);
  }

  window.addEventListener("message", (event) => {
    if (event.origin === window.location.origin) {
      handleResult(event.data);
    }
  });

  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEYS.result && event.newValue) {
      try {
        handleResult(JSON.parse(event.newValue));
      } catch {
        // Ignore malformed cross-window storage messages.
      }
    }
  });

  channel?.addEventListener("message", (event) => handleResult(event.data));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorElement.hidden = true;
    startButton.disabled = true;
    waiting = true;
    setConnectionStatus("Preparing GitHub", "warning");
    popup = openPopup("popup.html");

    if (!popup) {
      waiting = false;
      startButton.disabled = false;
      setConnectionStatus("Popup blocked", "warning");
      showError(errorElement, "Allow popups for this site and try again.");
      return;
    }

    popupControls.hidden = false;

    try {
      const result = await postJson("/api/oauth/start", {
        authMode: form.elements.authMode.value,
        project,
      });
      popup.location.replace(result.authorizeUrl);
      popup.focus();
      setConnectionStatus("Waiting for GitHub", "warning");
    } catch (error) {
      waiting = false;
      popup.close();
      popupControls.hidden = true;
      startButton.disabled = false;
      setConnectionStatus("Stopped", "warning");
      showError(errorElement, messageOf(error));
      return;
    }

    popupTimer = window.setInterval(() => {
      if (!popup?.closed || !waiting) {
        return;
      }

      waiting = false;
      window.clearInterval(popupTimer);
      popupControls.hidden = true;
      startButton.disabled = false;
      setConnectionStatus("Popup closed", "warning");
      showError(errorElement, "The GitHub popup closed before the connection completed.");
    }, 500);
  });

  closePopupButton.addEventListener("click", () => {
    waiting = false;
    popup?.close();
    window.clearInterval(popupTimer);
    popupControls.hidden = true;
    startButton.disabled = false;
    setConnectionStatus("Cancelled", "neutral");
  });

  window.addEventListener("beforeunload", () => {
    channel?.close();
    window.clearInterval(popupTimer);
  });
}

function initializeCallbackPage() {
  required("close-callback").addEventListener("click", closeCallbackWindow);
  const query = new URLSearchParams(window.location.search);
  const githubError = query.get("error");

  if (githubError) {
    finishWithError(query.get("error_description") ?? githubError);
    return;
  }

  const code = query.get("code");
  const installationId = query.get("installation_id");

  if (code) {
    void completeOAuth(code, query.get("state"));
  } else if (installationId) {
    void completeInstallation(installationId, query.get("state"));
  } else {
    finishWithError("GitHub did not return an OAuth code or installation ID.");
  }

  async function completeOAuth(oauthCode, state) {
    setStage("oauth-stage", "active");
    text("callback-title", "Finding your GitHub App installations…");

    try {
      const result = await postJson("/api/oauth/complete", {
        code: oauthCode,
        state,
      });
      handleCallbackResult(result);
    } catch (error) {
      finishWithError(messageOf(error));
    }
  }

  async function completeInstallation(returnedInstallationId, state) {
    setStage("oauth-stage", "complete");
    setStage("install-stage", "active");
    text("callback-title", "Verifying the new installation…");

    try {
      const result = await postJson("/api/install/complete", {
        installationId: returnedInstallationId,
        state,
      });
      handleCallbackResult(result);
    } catch (error) {
      finishWithError(messageOf(error));
    }
  }

  function handleCallbackResult(result) {
    if (result.status === "install_required") {
      setStage("oauth-stage", "complete");
      setStage("install-stage", "active");
      text("callback-title", "No existing installation was found.");
      text("callback-message", "Continuing to GitHub App installation…");
      window.setTimeout(() => window.location.assign(result.installationUrl), 650);
      return;
    }

    if (result.status === "choose_installation") {
      setStage("oauth-stage", "complete");
      setStage("install-stage", "active");
      text("callback-title", "Choose an installation.");
      text("callback-message", "Select the GitHub account or organization to connect.");
      renderInstallations(result.installations);
      return;
    }

    if (result.status === "connected" && result.connection) {
      finishSuccessfully(result.connection);
      return;
    }

    finishWithError("The backend returned an unsupported connection result.");
  }

  function renderInstallations(installations) {
    const picker = required("installation-picker");
    const options = required("installation-options");
    picker.hidden = false;
    options.replaceChildren();

    installations.forEach((installation) => {
      const button = document.createElement("button");
      const avatar = installation.avatarUrl
        ? document.createElement("img")
        : document.createElement("span");
      const details = document.createElement("span");
      const title = document.createElement("strong");
      const subtitle = document.createElement("small");
      const arrow = document.createElement("b");

      button.type = "button";
      button.className = "installation-option";

      if (installation.avatarUrl) {
        avatar.src = installation.avatarUrl;
        avatar.alt = "";
      } else {
        avatar.textContent = "GH";
      }

      title.textContent = installation.accountLogin;
      subtitle.textContent =
        `${installation.accountType} · ${installation.repositorySelection} repositories`;
      arrow.textContent = "→";
      details.append(title, subtitle);
      button.append(avatar, details, arrow);
      button.addEventListener("click", async () => {
        options.querySelectorAll("button").forEach((option) => {
          option.disabled = true;
        });

        try {
          const result = await postJson("/api/installations/select", {
            installationId: installation.id,
          });
          picker.hidden = true;
          handleCallbackResult(result);
        } catch (error) {
          finishWithError(messageOf(error));
        }
      });
      options.append(button);
    });
  }
}

function initializeTestsPage() {
  const missingSession = required("missing-session");
  const experience = required("tests-experience");
  const repositorySelect = required("repository-select");
  const repositoryLink = required("repository-link");
  const createPrButton = required("create-pr");
  const createIssueButton = required("create-issue");
  const errorElement = required("action-error");
  const resultCard = required("action-result");
  let repositories = [];

  required("reset-connection").addEventListener("click", async () => {
    try {
      await fetch("/api/session", { method: "DELETE" });
    } finally {
      removeStorage(STORAGE_KEYS.connection);
      window.location.assign("index.html");
    }
  });

  repositorySelect.addEventListener("change", updateRepositoryLink);
  createPrButton.addEventListener("click", () => void runAction("pr"));
  createIssueButton.addEventListener("click", () => void runAction("issue"));
  void loadWorkspace();

  async function loadWorkspace() {
    try {
      const sessionResult = await getJson("/api/session");
      const connection = sessionResult.connection;
      writeStorage(STORAGE_KEYS.connection, connection);
      populateSummary(connection);
      const repositoryResult = await getJson("/api/repositories");
      repositories = repositoryResult.repositories ?? [];
      repositorySelect.replaceChildren();

      if (repositories.length === 0) {
        const option = document.createElement("option");
        option.textContent = "No repositories available";
        repositorySelect.append(option);
        showError(errorElement, "This installation does not expose any repositories.");
        return;
      }

      repositories.forEach((repository) => {
        const option = document.createElement("option");
        option.value = repository.fullName;
        option.textContent =
          `${repository.fullName}${repository.private ? " · private" : ""}`;
        repositorySelect.append(option);
      });
      repositorySelect.disabled = false;
      createPrButton.disabled = false;
      createIssueButton.disabled = false;
      updateRepositoryLink();
    } catch (error) {
      missingSession.hidden = false;
      experience.hidden = true;
      removeStorage(STORAGE_KEYS.connection);
    }
  }

  function populateSummary(connection) {
    text("summary-account", connection.accountLogin);
    text("summary-installation", connection.installationId);
    text(
      "summary-auth",
      connection.authMode === "installation" ? "App token" : "User OAuth",
    );
    text("summary-project", connection.projectName);
    text("summary-connection", connection.connectionName);
  }

  function updateRepositoryLink() {
    const repository = repositories.find(
      (candidate) => candidate.fullName === repositorySelect.value,
    );
    repositoryLink.hidden = !repository;

    if (repository) {
      repositoryLink.href = repository.htmlUrl;
    }
  }

  async function runAction(type) {
    const repository = repositorySelect.value;

    if (!repository) {
      showError(errorElement, "Choose a repository first.");
      return;
    }

    const activeButton = type === "pr" ? createPrButton : createIssueButton;
    const originalLabel = activeButton.textContent;
    setControlsDisabled(true);
    activeButton.textContent = type === "pr" ? "Creating PR…" : "Creating issue…";
    errorElement.hidden = true;
    resultCard.hidden = true;

    try {
      const result = await postJson(
        type === "pr" ? "/api/pull-requests" : "/api/issues",
        { repository },
      );
      text("result-type", type === "pr" ? "Pull request created" : "Issue created");
      text("result-title", result.title);
      text(
        "result-meta",
        type === "pr"
          ? `${result.repository} · #${result.number} · ${result.branch}`
          : `${result.repository} · #${result.number}`,
      );
      required("result-link").href = result.url;
      resultCard.hidden = false;
      showToast(`${type === "pr" ? "Pull request" : "Issue"} #${result.number} created.`);
    } catch (error) {
      showError(errorElement, messageOf(error));
    } finally {
      activeButton.textContent = originalLabel;
      setControlsDisabled(false);
    }
  }

  function setControlsDisabled(disabled) {
    repositorySelect.disabled = disabled;
    createPrButton.disabled = disabled;
    createIssueButton.disabled = disabled;
  }
}

function finishSuccessfully(connection) {
  setStage("oauth-stage", "complete");
  setStage("install-stage", "complete");
  setStage("complete-stage", "active");
  text("callback-title", "GitHub connection completed.");
  text(
    "callback-message",
    `Installation ${connection.installationId} for ${connection.accountLogin} is ready.`,
  );
  notifyMainWindow({
    source: "foundry-pr-studio",
    type: MESSAGE_TYPE,
    status: "connected",
    connection,
  });
  window.setTimeout(closeCallbackWindow, 500);
}

function finishWithError(message) {
  required("callback-spinner").hidden = true;
  text("callback-eyebrow", "Connection stopped");
  text("callback-title", "GitHub connection could not be completed.");
  text("callback-message", "Close this popup and retry from the main page.");
  showError(required("callback-error"), message);
  required("close-callback").hidden = false;
  notifyMainWindow({
    source: "foundry-pr-studio",
    type: MESSAGE_TYPE,
    status: "error",
    message,
  });
}

function notifyMainWindow(message) {
  writeStorage(STORAGE_KEYS.result, message);

  if ("BroadcastChannel" in window) {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage(message);
    channel.close();
  }

  window.opener?.postMessage(message, window.location.origin);
}

function closeCallbackWindow() {
  window.close();

  if (!window.closed) {
    required("callback-spinner").hidden = true;
    required("close-callback").hidden = false;
  }
}

function createRandomProject() {
  const randomValues = new Uint32Array(2);
  window.crypto.getRandomValues(randomValues);
  const word = PROJECT_WORDS[randomValues[0] % PROJECT_WORDS.length];
  const suffix = randomValues[1].toString(36).slice(0, 6).padStart(6, "0");
  const projectName = `foundry-${word}-${suffix}`;
  return {
    projectName,
    connectionName: `github-${suffix}`,
    projectEndpoint:
      `https://${projectName}.services.ai.azure.com/api/projects/${projectName}`,
  };
}

function openPopup(url) {
  const width = 650;
  const height = 760;
  const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2));
  const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2));
  return window.open(
    url,
    `foundry-github-${Date.now()}`,
    `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`,
  );
}

function setRuntimeStatus(label, tone) {
  const element = required("runtime-status");
  element.className = `status-pill status-${tone}`;
  element.replaceChildren();
  const dot = document.createElement("span");
  dot.className = "status-dot";
  element.append(dot, label);
}

function setConnectionStatus(label, tone) {
  const element = required("connection-status");
  element.className = `status-pill status-${tone}`;
  element.textContent = label;
}

function setStage(id, state) {
  const element = required(id);
  element.className = `is-${state}`;
}

function isConnectionMessage(value) {
  return Boolean(
    value
    && value.source === "foundry-pr-studio"
    && value.type === MESSAGE_TYPE
    && (value.status === "connected" || value.status === "error"),
  );
}

async function getJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  return parseResponse(response);
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseResponse(response);
}

async function parseResponse(response) {
  let result;

  try {
    result = await response.json();
  } catch {
    throw new Error("The backend returned an invalid response.");
  }

  if (!response.ok) {
    throw new Error(result.error ?? `Request failed with HTTP ${response.status}.`);
  }

  return result;
}

function readStorage(key) {
  const value = window.sessionStorage.getItem(key)
    ?? window.localStorage.getItem(key);

  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    removeStorage(key);
    return null;
  }
}

function writeStorage(key, value) {
  const serialized = JSON.stringify(value);
  window.sessionStorage.setItem(key, serialized);

  if (key === STORAGE_KEYS.result) {
    window.localStorage.setItem(key, serialized);
  }
}

function removeStorage(key) {
  window.sessionStorage.removeItem(key);
  window.localStorage.removeItem(key);
}

function showError(element, message) {
  element.textContent = message;
  element.hidden = false;
}

function showToast(message) {
  const toast = document.getElementById("toast");

  if (!toast) {
    return;
  }

  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.hidden = true;
  }, 3200);
}

showToast.timer = 0;

function messageOf(error) {
  return error instanceof Error ? error.message : "Unexpected error.";
}

function required(id) {
  const element = document.getElementById(id);

  if (!element) {
    throw new Error(`Required element #${id} was not found.`);
  }

  return element;
}

function text(id, value) {
  required(id).textContent = String(value);
}
