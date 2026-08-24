# Foundry PR Studio

Full-stack GitHub App demo deployed from GitHub to Vercel.

## Flow

1. The main page opens GitHub in a popup.
2. GitHub authorizes the user.
3. Existing `zyying-public-app` installations are discovered automatically.
4. If no installation exists, the popup continues to GitHub App installation and returns to the
   setup callback.
5. The popup notifies the main page and closes.
6. The test page lists repositories available to the selected installation.
7. Two buttons create a real pull request or issue using random templates.

## Why no database is required

- Static HTML, CSS, and JavaScript are cached by Vercel's CDN and the browser.
- OAuth state and PKCE data are encrypted into the short-lived `state` parameter.
- The GitHub user token and selected installation are stored in a short-lived encrypted,
  `HttpOnly`, `SameSite=Lax` cookie.
- Installation tokens are generated on demand and are never sent to browser JavaScript.

The Vercel Functions are stateless; restarting or scaling functions does not lose a server-side
session record because no in-memory session map is used.

## Vercel environment variables

Configure these in **Vercel Project Settings → Environment Variables**:

| Variable | Secret | Description |
|---|---:|---|
| `GITHUB_APP_ID` | No | GitHub App numeric ID |
| `GITHUB_APP_SLUG` | No | `zyying-public-app` |
| `GITHUB_APP_CLIENT_ID` | No | GitHub App client ID |
| `GITHUB_APP_CLIENT_SECRET` | Yes | Rotated GitHub App client secret |
| `GITHUB_APP_PRIVATE_KEY_B64` | Yes | Base64-encoded PEM private key |
| `SESSION_SECRET` | Yes | Random value with at least 32 characters |
| `APP_ORIGIN` | No | Stable production URL, for example `https://example.vercel.app` |

Never commit `.env` files, private keys, client secrets, session secrets, or tokens.

## GitHub App settings

After the first Vercel production deployment, configure:

```text
Callback URL: https://<production-domain>/callback.html
Setup URL:    https://<production-domain>/callback.html
```

Keep **Request user authorization (OAuth) during installation** disabled. This app explicitly
authorizes the user first so an existing installation can be reused instead of opening the GitHub
installation settings page.

Required repository permissions:

- Contents: read and write
- Pull requests: read and write
- Issues: read and write
- Metadata: read

## Local development

Create `.env.local` from `.env.example`, then run:

```powershell
npx vercel dev
```

Local callback and setup URL:

```text
http://localhost:3000/callback.html
```
