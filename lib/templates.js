import { randomBytes } from "node:crypto";

const pullRequestTemplates = Object.freeze([
  {
    title: "Add a GitHub App integration smoke-test note",
    heading: "GitHub App integration smoke test",
    description:
      "This file verifies installation-token pull request creation from Foundry PR Studio.",
  },
  {
    title: "Document the Foundry PR Studio connection check",
    heading: "Foundry PR Studio connection check",
    description:
      "This note confirms that the GitHub App can create a branch, commit content, and open a pull request.",
  },
  {
    title: "Add an automated repository connection sample",
    heading: "Automated repository connection sample",
    description:
      "This sample was generated from a random test template through Foundry PR Studio.",
  },
]);

const issueTemplates = Object.freeze([
  {
    title: "Validate GitHub App repository automation",
    body:
      "Confirm that the installed GitHub App can perform the expected repository automation.",
  },
  {
    title: "Review Foundry PR Studio integration settings",
    body:
      "Review the repository permissions and connection metadata used by Foundry PR Studio.",
  },
  {
    title: "Track GitHub App integration smoke testing",
    body:
      "Use this issue to track the generated GitHub App integration smoke test.",
  },
]);

export function getRandomPullRequestTemplate() {
  return selectRandom(pullRequestTemplates);
}

export function getRandomIssueTemplate() {
  return selectRandom(issueTemplates);
}

function selectRandom(values) {
  return values[randomBytes(4).readUInt32BE(0) % values.length];
}
