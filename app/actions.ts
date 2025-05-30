"use server"

// Helper function to handle rate limiting with better 404 handling
async function fetchWithRateLimitHandling(url: string, options: RequestInit = {}, allowNotFound = false) {
  const maxRetries = 3
  let retryCount = 0
  let retryDelay = 1000 // Start with 1 second delay

  while (retryCount < maxRetries) {
    try {
      console.log(`Making request to: ${url} (attempt ${retryCount + 1}/${maxRetries})`)

      const response = await fetch(url, options)

      console.log(`Response status: ${response.status}`)
      console.log(`Response ok: ${response.ok}`)

      // Check if we hit rate limits
      if (response.status === 403 || response.status === 429) {
        const rateLimitRemaining = response.headers.get("x-ratelimit-remaining")
        const rateLimitReset = response.headers.get("x-ratelimit-reset")
        const retryAfter = response.headers.get("retry-after")

        console.log(`Rate limit hit: ${response.status}`)
        console.log(`Remaining: ${rateLimitRemaining}, Reset: ${rateLimitReset}, Retry-After: ${retryAfter}`)

        // If we have a retry-after header, use that
        if (retryAfter) {
          const delay = Number.parseInt(retryAfter, 10) * 1000
          console.log(`Waiting for ${delay}ms as specified by retry-after header`)
          await new Promise((resolve) => setTimeout(resolve, delay))
          retryCount++
          continue
        }

        // Otherwise use exponential backoff
        console.log(`Retrying after ${retryDelay}ms (attempt ${retryCount + 1}/${maxRetries})`)
        await new Promise((resolve) => setTimeout(resolve, retryDelay))
        retryDelay *= 2 // Exponential backoff
        retryCount++
        continue
      }

      // Handle 404 responses
      if (response.status === 404) {
        if (allowNotFound) {
          console.log("404 response allowed, returning response")
          return response
        } else {
          const contentType = response.headers.get("content-type")
          let errorMessage = "Not Found"

          try {
            if (contentType && contentType.includes("application/json")) {
              const errorData = await response.json()
              errorMessage = errorData.message || errorMessage
            } else {
              const errorText = await response.text()
              if (errorText) {
                errorMessage = errorText
              }
            }
          } catch (parseError) {
            console.log(`Could not parse 404 error response: ${parseError.message}`)
          }

          throw new Error(`API Error (${response.status}): ${errorMessage}`)
        }
      }

      // For successful responses, return the response
      if (response.ok) {
        return response
      }

      // For other errors, try to parse the error message
      const contentType = response.headers.get("content-type")
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`

      try {
        if (contentType && contentType.includes("application/json")) {
          const errorData = await response.json()
          errorMessage = errorData.message || errorMessage
        } else {
          const errorText = await response.text()
          if (errorText) {
            errorMessage = errorText
          }
        }
      } catch (parseError) {
        console.log(`Could not parse error response: ${parseError.message}`)
      }

      throw new Error(`API Error (${response.status}): ${errorMessage}`)
    } catch (error) {
      console.error(`Request failed (attempt ${retryCount + 1}): ${error.message}`)

      // If it's a network error or fetch failed, retry
      if (
        retryCount < maxRetries - 1 &&
        (error.message.includes("fetch") ||
          error.message.includes("network") ||
          error.message.includes("ECONNRESET") ||
          error.message.includes("timeout"))
      ) {
        console.log(`Network error, retrying after ${retryDelay}ms`)
        await new Promise((resolve) => setTimeout(resolve, retryDelay))
        retryDelay *= 2
        retryCount++
        continue
      } else {
        // For API errors or last retry, throw the error
        throw error
      }
    }
  }

  throw new Error(`Failed after ${maxRetries} retries`)
}

// Debug function to test GitHub access
export async function debugGitHubAccess() {
  const token = process.env.GITHUB_TOKEN
  const username = process.env.GITHUB_USERNAME
  const repo = process.env.GITHUB_REPO

  console.log("=== GitHub Debug Information ===")
  console.log(`Token exists: ${!!token}`)
  console.log(`Token length: ${token?.length || 0}`)
  console.log(`Token starts with: ${token?.substring(0, 4) || "N/A"}...`)
  console.log(`Username: ${username}`)
  console.log(`Repository: ${repo}`)

  if (!token || !username || !repo) {
    return {
      success: false,
      error: "Missing environment variables",
      details: {
        hasToken: !!token,
        hasUsername: !!username,
        hasRepo: !!repo,
      },
    }
  }

  // Test 1: Check if token can authenticate
  try {
    console.log("Testing basic authentication...")
    const authResponse = await fetchWithRateLimitHandling("https://api.github.com/user", {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "PyToExe-Converter",
      },
    })

    console.log(`Auth test status: ${authResponse.status}`)
    const userData = await authResponse.json()
    console.log(`Authenticated as: ${userData.login}`)
    console.log(`User type: ${userData.type}`)
  } catch (error) {
    console.log(`Auth test error: ${error}`)
    return {
      success: false,
      error: `Auth test failed: ${error.message}`,
      details: { authError: error.message },
    }
  }

  // Test 2: Check repository access
  try {
    console.log("Testing repository access...")
    const repoResponse = await fetchWithRateLimitHandling(`https://api.github.com/repos/${username}/${repo}`, {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "PyToExe-Converter",
      },
    })

    console.log(`Repo test status: ${repoResponse.status}`)
    const repoData = await repoResponse.json()
    console.log(`Repository: ${repoData.full_name}`)
    console.log(`Private: ${repoData.private}`)
    console.log(`Permissions: ${JSON.stringify(repoData.permissions)}`)
  } catch (error) {
    console.log(`Repo test error: ${error}`)
    return {
      success: false,
      error: `Repo test failed: ${error.message}`,
      details: { repoError: error.message },
    }
  }

  // Test 3: Check if we can read contents
  try {
    console.log("Testing contents access...")
    const contentsResponse = await fetchWithRateLimitHandling(
      `https://api.github.com/repos/${username}/${repo}/contents`,
      {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "PyToExe-Converter",
        },
      },
    )

    console.log(`Contents test status: ${contentsResponse.status}`)
  } catch (error) {
    console.log(`Contents test error: ${error}`)
    return {
      success: false,
      error: `Contents test failed: ${error.message}`,
      details: { contentsError: error.message },
    }
  }

  return {
    success: true,
    message: "All GitHub access tests passed",
    details: { username, repo },
  }
}

// Function to upload file to GitHub
export async function uploadFileToGithub(fileContent: string, fileName: string) {
  try {
    const token = process.env.GITHUB_TOKEN
    const username = process.env.GITHUB_USERNAME
    const repo = process.env.GITHUB_REPO
    const path = `python-files/${fileName}`

    console.log(`=== Upload Process Started ===`)
    console.log(`File: ${fileName}`)
    console.log(`Target: ${username}/${repo}/${path}`)
    console.log(`Content length: ${fileContent.length}`)

    if (!token || !username || !repo) {
      throw new Error("Missing environment variables")
    }

    // First, let's verify the repository exists
    console.log("Step 0: Verifying repository access...")
    try {
      const repoCheckResponse = await fetchWithRateLimitHandling(`https://api.github.com/repos/${username}/${repo}`, {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "PyToExe-Converter",
        },
      })

      const repoData = await repoCheckResponse.json()
      console.log(`Repository verified: ${repoData.full_name}`)
      console.log(`Repository permissions:`, repoData.permissions)
    } catch (repoError) {
      console.error(`Repository verification failed: ${repoError.message}`)
      throw new Error(
        `Cannot access repository ${username}/${repo}. Please check that the repository exists and your token has the correct permissions. Error: ${repoError.message}`,
      )
    }

    // Step 1: Check if file already exists (404 is expected if file doesn't exist)
    let sha = ""
    console.log("Step 1: Checking if file exists...")

    try {
      const checkResponse = await fetchWithRateLimitHandling(
        `https://api.github.com/repos/${username}/${repo}/contents/${path}`,
        {
          headers: {
            Authorization: `token ${token}`,
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "PyToExe-Converter",
          },
        },
        true, // Allow 404 responses
      )

      if (checkResponse.status === 404) {
        console.log("File doesn't exist, will create new")
      } else if (checkResponse.ok) {
        const data = await checkResponse.json()
        sha = data.sha
        console.log(`File exists, SHA: ${sha}`)
      } else {
        console.log(`Unexpected response when checking file: ${checkResponse.status}`)
      }
    } catch (error) {
      console.log(`File check exception: ${error.message}`)
      // Don't throw here, just log and continue
    }

    // Step 2: Prepare upload data
    console.log("Step 2: Preparing upload data...")
    const uploadData = {
      message: `Upload ${fileName} via PY to EXE tool`,
      content: Buffer.from(fileContent).toString("base64"),
      ...(sha && { sha }),
    }

    console.log(`Upload data prepared, has SHA: ${!!sha}`)

    // Step 3: Upload the file
    console.log("Step 3: Uploading file...")
    const uploadResponse = await fetchWithRateLimitHandling(
      `https://api.github.com/repos/${username}/${repo}/contents/${path}`,
      {
        method: "PUT",
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
          "User-Agent": "PyToExe-Converter",
        },
        body: JSON.stringify(uploadData),
      },
    )

    console.log(`Upload response status: ${uploadResponse.status}`)
    console.log(`Upload response headers: ${JSON.stringify(Object.fromEntries(uploadResponse.headers.entries()))}`)

    const uploadResult = await uploadResponse.json()
    console.log("=== UPLOAD SUCCESSFUL ===")
    console.log(`File uploaded: ${uploadResult.content?.name}`)
    console.log(`Commit SHA: ${uploadResult.commit?.sha}`)

    return {
      success: true,
      message: `Successfully uploaded ${fileName} to GitHub repository`,
      data: uploadResult,
    }
  } catch (error) {
    console.error("=== UPLOAD ERROR ===", error)
    throw error
  }
}

// Function to delete file from GitHub
export async function deleteFileFromGithub(fileName: string) {
  const token = process.env.GITHUB_TOKEN
  const username = process.env.GITHUB_USERNAME
  const repo = process.env.GITHUB_REPO
  const path = `python-files/${fileName}`

  if (!token || !username || !repo) {
    throw new Error("Missing required environment variables")
  }

  try {
    // First, we need to get the file's SHA
    const getFileResponse = await fetchWithRateLimitHandling(
      `https://api.github.com/repos/${username}/${repo}/contents/${path}`,
      {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "PyToExe-Converter",
        },
      },
    )

    const fileData = await getFileResponse.json()
    const sha = fileData.sha

    // Now delete the file
    const deleteResponse = await fetchWithRateLimitHandling(
      `https://api.github.com/repos/${username}/${repo}/contents/${path}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
          "User-Agent": "PyToExe-Converter",
        },
        body: JSON.stringify({
          message: `Delete ${fileName} after successful workflow completion`,
          sha: sha,
        }),
      },
    )

    return { success: true, message: `Successfully deleted ${fileName} from repository` }
  } catch (error) {
    console.error("Error deleting file from GitHub:", error)
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
    console.log(`=== Checking Workflow Status ===`)
    console.log(`Workflow ID: ${workflowRunId}`)

    const response = await fetchWithRateLimitHandling(
      `https://api.github.com/repos/${username}/${repo}/actions/runs/${workflowRunId}`,
      {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "PyToExe-Converter",
        },
      },
    )

    console.log(`Workflow status API response: ${response.status}`)
    const data = await response.json()
    console.log(`Workflow status: ${data.status}, conclusion: ${data.conclusion}`)
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
    console.log("=== Getting Latest Workflow Run ===")
    console.log(`Repository: ${username}/${repo}`)

    // Add a delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 2000))

    const response = await fetchWithRateLimitHandling(
      `https://api.github.com/repos/${username}/${repo}/actions/runs?per_page=5`,
      {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "PyToExe-Converter",
        },
      },
    )

    console.log(`Workflow API status: ${response.status}`)

    // Safely parse the response
    let responseText
    try {
      responseText = await response.text()
      const data = JSON.parse(responseText)

      console.log(`Total workflow runs found: ${data.total_count}`)
      console.log(`Workflow runs in response: ${data.workflow_runs?.length || 0}`)

      if (data.workflow_runs && data.workflow_runs.length > 0) {
        const latestRun = data.workflow_runs[0]
        console.log(
          `Latest workflow: ID ${latestRun.id}, Status: ${latestRun.status}, Created: ${latestRun.created_at}`,
        )
        return latestRun
      } else {
        console.log("No workflow runs found")
        throw new Error("No workflow runs found. Make sure GitHub Actions are enabled and workflows exist.")
      }
    } catch (parseError) {
      console.error("Error parsing workflow response:", parseError)
      console.error("Response text:", responseText)
      throw new Error(
        `Failed to parse workflow response: ${parseError.message}. Response: ${responseText.substring(0, 100)}...`,
      )
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
    const response = await fetchWithRateLimitHandling(
      `https://api.github.com/repos/${username}/${repo}/actions/runs/${workflowRunId}/artifacts`,
      {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "PyToExe-Converter",
        },
      },
    )

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
    console.log(`=== Downloading Artifact ${artifactId} ===`)

    // Step 1: Get artifact info first to check if it exists and is valid
    console.log("Step 1: Getting artifact info...")
    const artifactInfoResponse = await fetchWithRateLimitHandling(
      `https://api.github.com/repos/${username}/${repo}/actions/artifacts/${artifactId}`,
      {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "PyToExe-Converter",
        },
      },
    )

    const artifactInfo = await artifactInfoResponse.json()
    console.log(`Artifact info: ${artifactInfo.name}, expired: ${artifactInfo.expired}`)

    if (artifactInfo.expired) {
      throw new Error("Artifact has expired and is no longer available for download")
    }

    // Step 2: Try to get the download URL
    console.log("Step 2: Getting download URL...")

    // Use a different approach - try without manual redirect first
    let downloadResponse
    try {
      downloadResponse = await fetch(
        `https://api.github.com/repos/${username}/${repo}/actions/artifacts/${artifactId}/zip`,
        {
          method: "GET",
          headers: {
            Authorization: `token ${token}`,
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "PyToExe-Converter",
          },
          // Let the browser handle redirects automatically
        },
      )

      console.log(`Download response status: ${downloadResponse.status}`)
      console.log(`Download response headers:`, Object.fromEntries(downloadResponse.headers.entries()))

      if (downloadResponse.ok) {
        // Direct download worked
        console.log("Direct download successful")
        const artifactData = await downloadResponse.arrayBuffer()
        console.log(`Downloaded ${artifactData.byteLength} bytes`)

        return {
          success: true,
          data: Buffer.from(artifactData).toString("base64"),
          contentType: downloadResponse.headers.get("content-type") || "application/zip",
          filename: `${artifactInfo.name}.zip`,
        }
      }
    } catch (directDownloadError) {
      console.log(`Direct download failed: ${directDownloadError.message}`)
    }

    // Step 3: If direct download failed, try manual redirect handling
    console.log("Step 3: Trying manual redirect handling...")

    try {
      const redirectResponse = await fetch(
        `https://api.github.com/repos/${username}/${repo}/actions/artifacts/${artifactId}/zip`,
        {
          method: "GET",
          headers: {
            Authorization: `token ${token}`,
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "PyToExe-Converter",
          },
          redirect: "manual",
        },
      )

      console.log(`Redirect response status: ${redirectResponse.status}`)
      console.log(`Redirect response headers:`, Object.fromEntries(redirectResponse.headers.entries()))

      if (redirectResponse.status === 302 || redirectResponse.status === 301) {
        const downloadUrl = redirectResponse.headers.get("location")
        console.log(`Got redirect URL: ${downloadUrl ? "Yes" : "No"}`)

        if (!downloadUrl) {
          throw new Error("No redirect URL found in response headers")
        }

        // Download from the redirect URL
        console.log("Downloading from redirect URL...")
        const finalDownloadResponse = await fetch(downloadUrl, {
          method: "GET",
          headers: {
            "User-Agent": "PyToExe-Converter",
          },
        })

        console.log(`Final download response status: ${finalDownloadResponse.status}`)

        if (!finalDownloadResponse.ok) {
          const errorText = await finalDownloadResponse.text()
          console.error(`Final download failed: ${finalDownloadResponse.status}`)
          console.error(`Error response: ${errorText}`)
          throw new Error(
            `Failed to download from redirect URL: ${finalDownloadResponse.status} ${finalDownloadResponse.statusText}`,
          )
        }

        const artifactData = await finalDownloadResponse.arrayBuffer()
        console.log(`Downloaded ${artifactData.byteLength} bytes from redirect`)

        return {
          success: true,
          data: Buffer.from(artifactData).toString("base64"),
          contentType: finalDownloadResponse.headers.get("content-type") || "application/zip",
          filename: `${artifactInfo.name}.zip`,
        }
      } else {
        throw new Error(`Unexpected redirect response status: ${redirectResponse.status}`)
      }
    } catch (redirectError) {
      console.error(`Redirect download failed: ${redirectError.message}`)
      throw new Error(`Both direct and redirect download methods failed. Last error: ${redirectError.message}`)
    }
  } catch (error) {
    console.error("Error in getArtifactDownloadUrl:", error)

    // Provide more specific error messages
    if (error.message.includes("expired")) {
      throw new Error("Artifact has expired and is no longer available for download")
    } else if (error.message.includes("404")) {
      throw new Error("Artifact not found. It may have been deleted or expired.")
    } else if (error.message.includes("403")) {
      throw new Error("Access denied. Please check your GitHub token permissions.")
    } else if (error.message.includes("rate limit") || error.message.includes("429")) {
      throw new Error("Rate limit exceeded. Please wait a moment and try again.")
    } else {
      throw new Error(`Download failed: ${error.message}`)
    }
  }
}

// Function to get GitHub user information
export async function getGitHubUserInfo(username: string) {
  const token = process.env.GITHUB_TOKEN

  try {
    const response = await fetchWithRateLimitHandling(`https://api.github.com/users/${username}`, {
      headers: {
        ...(token && { Authorization: `token ${token}` }),
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "PyToExe-Converter",
      },
    })

    const userData = await response.json()
    return {
      success: true,
      name: userData.name || userData.login,
      avatar_url: userData.avatar_url,
      html_url: userData.html_url,
    }
  } catch (error) {
    console.error("Error getting GitHub user info:", error)
    throw error
  }
}
