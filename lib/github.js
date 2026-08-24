import {
  createHash,
  createSign,
  randomBytes,
} from "node:crypto";

const GITHUB_WEB_ORIGIN = "https://github.com";
const GITHUB_API_ORIGIN = "https://api.github.com";

export function createPkcePair() {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function createOAuthAuthorizeUrl(config, state, challenge) {
  const authorizeUrl = new URL("/login/oauth/authorize", GITHUB_WEB_ORIGIN);
  authorizeUrl.searchParams.set("client_id", config.clientId);
  authorizeUrl.searchParams.set("redirect_uri", config.callbackUrl);
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", challenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  authorizeUrl.searchParams.set("prompt", "select_account");
  return authorizeUrl.href;
}

export function createInstallationUrl(config, state) {
  const installationUrl = new URL(
    `/apps/${encodeURIComponent(config.appSlug)}/installations/new`,
    GITHUB_WEB_ORIGIN,
  );
  installationUrl.searchParams.set("state", state);
  return installationUrl.href;
}

export async function exchangeOAuthCode(config, code, verifier) {
  const response = await fetch(
    new URL("/login/oauth/access_token", GITHUB_WEB_ORIGIN),
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: config.callbackUrl,
        code_verifier: verifier,
      }),
    },
  );
  const result = await response.json();

  if (!response.ok || result.error || !result.access_token) {
    throw createGitHubError(
      response.status || 502,
      result.error_description ?? result.error ?? "GitHub OAuth exchange failed.",
    );
  }

  return result.access_token;
}

export async function listUserInstallations(config, userAccessToken) {
  const result = await githubRequest(
    "/user/installations?per_page=100",
    userAccessToken,
  );
  return (result.installations ?? []).filter(
    (installation) =>
      Number(installation.app_id) === config.appId
      || installation.app_slug === config.appSlug,
  );
}

export async function listConnectionRepositories(config, session) {
  const accessToken = await getConnectionAccessToken(config, session);
  const path =
    session.authMode === "oauth"
      ? `/user/installations/${encodeURIComponent(session.installationId)}/repositories?per_page=100`
      : "/installation/repositories?per_page=100";
  const result = await githubRequest(path, accessToken);
  return result.repositories ?? [];
}

export async function getConnectionAccessToken(config, session) {
  if (session.authMode === "oauth") {
    if (!session.userAccessToken) {
      throw createGitHubError(401, "The GitHub user authorization expired.");
    }

    return session.userAccessToken;
  }

  const appJwt = createAppJwt(config);
  const result = await githubRequest(
    `/app/installations/${encodeURIComponent(session.installationId)}/access_tokens`,
    appJwt,
    { method: "POST" },
  );
  return result.token;
}

export async function resolveRepository(config, session, repositoryFullName) {
  const repositories = await listConnectionRepositories(config, session);
  const repository = repositories.find(
    (candidate) =>
      candidate.full_name.toLowerCase() === repositoryFullName.toLowerCase(),
  );

  if (!repository) {
    throw createGitHubError(
      403,
      "The selected repository is not available to this GitHub App installation.",
    );
  }

  return repository;
}

export async function createPullRequest(config, session, repository, template) {
  const accessToken = await getConnectionAccessToken(config, session);
  const owner = repository.owner.login;
  const repositoryName = repository.name;
  const baseBranch = repository.default_branch;
  const uniqueId = `${Date.now()}-${randomBytes(3).toString("hex")}`;
  const branchName = `foundry-pr-studio/demo-${uniqueId}`;
  const filePath = `.github/foundry-pr-studio/demo-${uniqueId}.md`;
  let branchCreated = false;

  if (!baseBranch) {
    throw createGitHubError(409, "The selected repository does not have a default branch.");
  }

  try {
    const baseReference = await githubRequest(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repositoryName)}/git/ref/${encodeGitRef(`heads/${baseBranch}`)}`,
      accessToken,
    );
    await githubRequest(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repositoryName)}/git/refs`,
      accessToken,
      {
        method: "POST",
        body: {
          ref: `refs/heads/${branchName}`,
          sha: baseReference.object.sha,
        },
      },
    );
    branchCreated = true;

    const generatedAt = new Date().toISOString();
    const fileContent = [
      `# ${template.heading}`,
      "",
      template.description,
      "",
      "## Test metadata",
      "",
      `- Repository: \`${repository.full_name}\``,
      `- Installation ID: \`${session.installationId}\``,
      `- Foundry project: \`${session.project.projectName}\``,
      `- Generated at: \`${generatedAt}\``,
      `- Template ID: \`${uniqueId}\``,
      "",
      "> This is an intentionally generated integration smoke test.",
      "",
    ].join("\n");

    await githubRequest(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repositoryName)}/contents/${encodeRepositoryPath(filePath)}`,
      accessToken,
      {
        method: "PUT",
        body: {
          message: `Add Foundry PR Studio smoke test ${uniqueId}`,
          content: Buffer.from(fileContent, "utf8").toString("base64"),
          branch: branchName,
        },
      },
    );

    const pullRequest = await githubRequest(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repositoryName)}/pulls`,
      accessToken,
      {
        method: "POST",
        body: {
          title: template.title,
          head: branchName,
          base: baseBranch,
          body: [
            "## Foundry PR Studio smoke test",
            "",
            "This pull request was created through the connected GitHub App using a random template.",
            "",
            `- Generated file: \`${filePath}\``,
            `- Authorization mode: \`${session.authMode}\``,
          ].join("\n"),
        },
      },
    );

    return {
      number: pullRequest.number,
      title: pullRequest.title,
      url: pullRequest.html_url,
      branch: branchName,
      filePath,
      repository: repository.full_name,
    };
  } catch (error) {
    if (branchCreated) {
      try {
        await githubRequest(
          `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repositoryName)}/git/refs/${encodeGitRef(`heads/${branchName}`)}`,
          accessToken,
          { method: "DELETE" },
        );
      } catch {
        // Preserve the original creation failure.
      }
    }

    throw error;
  }
}

export async function createIssue(config, session, repository, template) {
  const accessToken = await getConnectionAccessToken(config, session);
  const uniqueId = randomBytes(3).toString("hex");
  const issue = await githubRequest(
    `/repos/${encodeURIComponent(repository.owner.login)}/${encodeURIComponent(repository.name)}/issues`,
    accessToken,
    {
      method: "POST",
      body: {
        title: `[Foundry PR Studio] ${template.title}`,
        body: [
          template.body,
          "",
          "## Generated test metadata",
          "",
          `- Repository: \`${repository.full_name}\``,
          `- Installation ID: \`${session.installationId}\``,
          `- Foundry project: \`${session.project.projectName}\``,
          `- Test ID: \`${uniqueId}\``,
          `- Generated at: \`${new Date().toISOString()}\``,
          "",
          "> This issue was intentionally created as a GitHub App integration smoke test.",
        ].join("\n"),
      },
    },
  );

  return {
    number: issue.number,
    title: issue.title,
    url: issue.html_url,
    repository: repository.full_name,
  };
}

export function toPublicInstallation(installation) {
  return {
    id: String(installation.id),
    accountLogin: installation.account?.login ?? "unknown-account",
    accountType: installation.account?.type ?? "Unknown",
    avatarUrl: installation.account?.avatar_url ?? "",
    repositorySelection: installation.repository_selection ?? "selected",
  };
}

export function toPublicRepository(repository) {
  return {
    fullName: repository.full_name,
    name: repository.name,
    owner: repository.owner.login,
    private: repository.private,
    defaultBranch: repository.default_branch,
    htmlUrl: repository.html_url,
  };
}

async function githubRequest(path, accessToken, options = {}) {
  const response = await fetch(new URL(path, GITHUB_API_ORIGIN), {
    method: options.method ?? "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "User-Agent": "foundry-pr-studio",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const responseText = await response.text();
  const result = responseText ? JSON.parse(responseText) : null;

  if (!response.ok) {
    throw createGitHubError(
      response.status,
      result?.message ?? `GitHub API request failed with HTTP ${response.status}.`,
    );
  }

  return result;
}

function createAppJwt(config) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iat: now - 60,
      exp: now + 9 * 60,
      iss: String(config.appId),
    }),
  ).toString("base64url");
  const unsignedToken = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsignedToken);
  signer.end();
  const signature = signer.sign(config.privateKey).toString("base64url");
  return `${unsignedToken}.${signature}`;
}

function encodeGitRef(reference) {
  return reference
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function encodeRepositoryPath(filePath) {
  return filePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function createGitHubError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
