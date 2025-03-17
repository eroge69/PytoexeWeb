"use server"

// Function to upload file to GitHub
export async function uploadFileToGithub(fileContent: string, fileName: string) {
  // Access token from environment variables
  const token = process.env.GITHUB_TOKEN
  const username = process.env.GITHUB_USERNAME
  const repo = process.env.GITHUB_REPO
  const path = `python-files/${fileName}`

  // Validate environment variables
  if (!token) {
    throw new Error("GitHub token not configured. Please check your environment variables.")
  }

  if (!username) {
    throw new Error("GitHub username not configured. Please check your environment variables.")
  }

  if (!repo) {
    throw new Error("GitHub repository not configured. Please check your environment variables.")
  }

  // Log environment variable presence (not values for security)
  console.log(`Environment variables check:`)
  console.log(`- GITHUB_TOKEN: ${token ? "Present (length: " + token.length + ")" : "Missing"}`)
  console.log(`- GITHUB_USERNAME: ${username ? "Present" : "Missing"}`)
  console.log(`- GITHUB_REPO: ${repo ? "Present" : "Missing"}`)
  console.log(`Attempting to upload to ${username}/${repo} at path ${path}`)

  // Try different authentication methods
  const authMethods = [
    { name: "token", header: `token ${token}` },
    { name: "Bearer", header: `Bearer ${token}` },
    { name: "basic", header: `Basic ${Buffer.from(`${username}:${token}`).toString("base64")}` },
  ]

  let successfulAuth = null

  // Try each authentication method
  for (const auth of authMethods) {
    try {
      console.log(`Trying authentication method: ${auth.name}`)

      // Test authentication with a simple API call
      const testResponse = await fetch(`https://api.github.com/user`, {
        headers: {
          Authorization: auth.header,
          Accept: "application/vnd.github.v3+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      })

      if (testResponse.ok) {
        console.log(`Authentication successful with method: ${auth.name}`)
        successfulAuth = auth
        break
      } else {
        const status = testResponse.status
        console.log(`Authentication failed with method ${auth.name}: ${status}`)
      }
    } catch (error) {
      console.error(`Error testing ${auth.name} authentication:`, error)
    }
  }

  if (!successfulAuth) {
    throw new Error("All authentication methods failed. Please check your GitHub token.")
  }

  // Now use the successful authentication method for the actual upload
  console.log(`Using ${successfulAuth.name} authentication for upload`)

  // Check if file already exists
  let sha = ""
  try {
    console.log("Checking if file exists...")
    const checkUrl = `https://api.github.com/repos/${username}/${repo}/contents/${path}`

    const checkResponse = await fetch(checkUrl, {
      headers: {
        Authorization: successfulAuth.header,
        Accept: "application/vnd.github.v3+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    })

    if (checkResponse.ok) {
      const data = await checkResponse.json()
      sha = data.sha
      console.log(`File exists with SHA: ${sha}`)
    } else if (checkResponse.status === 404) {
      console.log("File does not exist yet, will create new file")
    } else {
      const errorText = await checkResponse.text()
      console.error(`Error checking file: ${checkResponse.status}`)
      console.error(`Response: ${errorText}`)
    }
  } catch (error) {
    console.error("Error checking if file exists:", error)
    // Continue anyway as the file might not exist yet
  }

  // Upload file to GitHub
  try {
    console.log("Uploading file to GitHub...")
    const uploadUrl = `https://api.github.com/repos/${username}/${repo}/contents/${path}`

    const requestBody = {
      message: `Upload ${fileName} via PY to EXE tool`,
      content: Buffer.from(fileContent).toString("base64"),
      ...(sha && { sha }), // Include sha if file exists (for updating)
    }

    const response = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: successfulAuth.header,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify(requestBody),
    })

    if (response.ok) {
      console.log("File uploaded successfully")
      return {
        success: true,
        message: `Successfully uploaded ${fileName} to GitHub repository`,
        auth: successfulAuth.header,
      }
    } else {
      // Get detailed error information
      const errorText = await response.text()
      console.error(`Error response: ${response.status}`)
      console.error(`Response: ${errorText}`)

      // Provide more specific error messages based on status code
      if (response.status === 401) {
        throw new Error("GitHub authentication failed. Please check your token.")
      } else if (response.status === 403) {
        throw new Error("GitHub permission denied. Your token may not have the required permissions.")
      } else if (response.status === 404) {
        throw new Error(`Repository ${username}/${repo} not found. Please check your repository name.`)
      } else {
        let errorMessage = "GitHub API error"
        try {
          const errorJson = JSON.parse(errorText)
          if (errorJson.message) {
            errorMessage += `: ${errorJson.message}`
          }
        } catch (e) {
          errorMessage += `: ${response.statusText}`
        }
        throw new Error(errorMessage)
      }
    }
  } catch (error) {
    console.error("Error in uploadFileToGithub:", error)
    throw error
  }
}

// Function to check workflow status
export async function checkWorkflowStatus(workflowRunId: number) {
  const token = process.env.GITHUB_TOKEN
  const username = process.env.GITHUB_USERNAME
  const repo = process.env.GITHUB_REPO

  if (!token || !username || !repo) {
    throw new Error("Missing required environment variables")
  }

  try {
    const response = await fetch(`https://api.github.com/repos/${username}/${repo}/actions/runs/${workflowRunId}`, {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    })

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    return data
  } catch (error) {
    console.error("Error checking workflow status:", error)
    throw error
  }
}

// Function to get latest workflow run
export async function getLatestWorkflowRun() {
  const token = process.env.GITHUB_TOKEN
  const username = process.env.GITHUB_USERNAME
  const repo = process.env.GITHUB_REPO

  if (!token || !username || !repo) {
    throw new Error("Missing required environment variables")
  }

  try {
    const response = await fetch(`https://api.github.com/repos/${username}/${repo}/actions/runs?per_page=1`, {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    })

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    if (data.workflow_runs && data.workflow_runs.length > 0) {
      return data.workflow_runs[0]
    } else {
      throw new Error("No workflow runs found")
    }
  } catch (error) {
    console.error("Error getting latest workflow run:", error)
    throw error
  }
}

// Function to get workflow artifacts
export async function getWorkflowArtifacts(workflowRunId: number) {
  const token = process.env.GITHUB_TOKEN
  const username = process.env.GITHUB_USERNAME
  const repo = process.env.GITHUB_REPO

  if (!token || !username || !repo) {
    throw new Error("Missing required environment variables")
  }

  try {
    const response = await fetch(
      `https://api.github.com/repos/${username}/${repo}/actions/runs/${workflowRunId}/artifacts`,
      {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    )

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    return data.artifacts || []
  } catch (error) {
    console.error("Error getting workflow artifacts:", error)
    throw error
  }
}

// Function to get artifact download URL
export async function getArtifactDownloadUrl(artifactId: number) {
  const token = process.env.GITHUB_TOKEN
  const username = process.env.GITHUB_USERNAME
  const repo = process.env.GITHUB_REPO

  if (!token || !username || !repo) {
    throw new Error("Missing required environment variables")
  }

  try {
    // Instead of just returning the URL, we'll create a pre-signed URL or proxy the download
    const response = await fetch(
      `https://api.github.com/repos/${username}/${repo}/actions/artifacts/${artifactId}/zip`,
      {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        // This is important - we need to follow redirects to get the actual content
        redirect: "follow",
      },
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`Error downloading artifact: ${response.status}`)
      console.error(`Response: ${errorText}`)
      throw new Error(`Failed to download artifact: ${response.statusText}`)
    }

    // Get the artifact data as a buffer
    const artifactData = await response.arrayBuffer()

    // Return the artifact data as base64
    return {
      success: true,
      data: Buffer.from(artifactData).toString("base64"),
      contentType: response.headers.get("content-type") || "application/zip",
      filename: `artifact-${artifactId}.zip`,
    }
  } catch (error) {
    console.error("Error getting artifact download:", error)
    throw error
  }
}

