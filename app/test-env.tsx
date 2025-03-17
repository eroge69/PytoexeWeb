"use server"

export async function testEnvironmentVariables() {
  const token = process.env.GITHUB_TOKEN
  const username = process.env.GITHUB_USERNAME
  const repo = process.env.GITHUB_REPO

  return {
    tokenExists: !!token,
    tokenLength: token ? token.length : 0,
    tokenPrefix: token ? token.substring(0, 4) + "..." : "N/A",
    usernameExists: !!username,
    username: username || "N/A",
    repoExists: !!repo,
    repo: repo || "N/A",
  }
}

