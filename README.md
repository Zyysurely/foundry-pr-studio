# Foundry PR Studio

A credential-free static demo designed for GitHub Pages.

## What it does

- Opens the public `zyying-public-app` GitHub App page.
- Generates a random local Foundry project label.
- Provides exactly two creation tests:
  - **PR test:** copies generated Markdown and opens GitHub's new-file editor. The user pastes,
    creates a branch, and confirms the pull request on GitHub.
  - **Issue test:** opens GitHub's new-issue form with a random prefilled title and body.

## Security model

This repository contains:

- No GitHub App private key
- No OAuth client secret
- No access or installation token
- No backend or local server dependency
- No machine-specific path

Because GitHub Pages is static, it cannot securely create resources with a GitHub App token.
Final creation therefore happens in GitHub's authenticated web interface.

## Local preview

Open `index.html`, or run any static web server:

```powershell
python -m http.server 4173
```

## GitHub Pages

The site is published from the `main` branch root.
