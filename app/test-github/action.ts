"use server"

export async function testGitHubConnection() {
  try {
    const username = process.env.GITHUB_USERNAME
    const token = process.env.GITHUB_TOKEN
    const repo = process.env.GITHUB_REPO

    console.log("Environment check:", {
      hasUsername: !!username,
      hasToken: !!token,
      hasRepo: !!repo,
      usernameValue: username, // Be careful with this in production
      repoValue: repo,
    })

    if (!username || !token || !repo) {
      throw new Error("Missing environment variables")
    }

    // Test GitHub API connection
    const response = await fetch(`https://api.github.com/repos/${username}/${repo}`, {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "PyToExe-Converter",
      },
    })

    const data = await response.json()

    console.log("GitHub API Response:", {
      status: response.status,
      ok: response.ok,
      data: data,
    })

    if (!response.ok) {
      throw new Error(`GitHub API Error: ${response.status} - ${data.message || "Unknown error"}`)
    }

    return {
      success: true,
      message: "GitHub connection successful!",
      repoInfo: {
        name: data.name,
        fullName: data.full_name,
        private: data.private,
      },
    }
  } catch (error) {
    console.error("GitHub test error:", error)
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unknown error occurred",
    }
  }
}
