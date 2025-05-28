"use server"

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
    const authResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "PyToExe-Converter",
      },
    })

    console.log(`Auth test status: ${authResponse.status}`)

    if (authResponse.ok) {
      const userData = await authResponse.json()
      console.log(`Authenticated as: ${userData.login}`)
      console.log(`User type: ${userData.type}`)
    } else {
      const errorText = await authResponse.text()
      console.log(`Auth failed: ${errorText}`)
      return {
        success: false,
        error: `Authentication failed: ${authResponse.status}`,
        details: { authStatus: authResponse.status, authError: errorText },
      }
    }
  } catch (error) {
    console.log(`Auth test error: ${error}`)
    return {
      success: false,
      error: `Auth test failed: ${error}`,
      details: { authError: error },
    }
  }

  // Test 2: Check repository access
  try {
    console.log("Testing repository access...")
    const repoResponse = await fetch(`https://api.github.com/repos/${username}/${repo}`, {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "PyToExe-Converter",
      },
    })

    console.log(`Repo test status: ${repoResponse.status}`)

    if (repoResponse.ok) {
      const repoData = await repoResponse.json()
      console.log(`Repository: ${repoData.full_name}`)
      console.log(`Private: ${repoData.private}`)
      console.log(`Permissions: ${JSON.stringify(repoData.permissions)}`)
    } else {
      const errorText = await repoResponse.text()
      console.log(`Repo access failed: ${errorText}`)
      return {
        success: false,
        error: `Repository access failed: ${repoResponse.status}`,
        details: { repoStatus: repoResponse.status, repoError: errorText },
      }
    }
  } catch (error) {
    console.log(`Repo test error: ${error}`)
    return {
      success: false,
      error: `Repo test failed: ${error}`,
      details: { repoError: error },
    }
  }

  // Test 3: Check if we can read contents
  try {
    console.log("Testing contents access...")
    const contentsResponse = await fetch(`https://api.github.com/repos/${username}/${repo}/contents`, {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "PyToExe-Converter",
      },
    })

    console.log(`Contents test status: ${contentsResponse.status}`)

    if (!contentsResponse.ok) {
      const errorText = await contentsResponse.text()
      console.log(`Contents access failed: ${errorText}`)
      return {
        success: false,
        error: `Contents access failed: ${contentsResponse.status}`,
        details: { contentsStatus: contentsResponse.status, contentsError: errorText },
      }
    }
  } catch (error) {
    console.log(`Contents test error: ${error}`)
    return {
      success: false,
      error: `Contents test failed: ${error}`,
      details: { contentsError: error },
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
    // First run debug to see what's wrong
    const debugResult = await debugGitHubAccess()

    if (!debugResult.success) {
      throw new Error(`GitHub access check failed: ${debugResult.error}`)
    }

    const token = process.env.GITHUB_TOKEN
    const username = process.env.GITHUB_USERNAME
    const repo = process.env.GITHUB_REPO
    const path = `python-files/${fileName}`

    console.log(`Attempting to upload ${fileName} to ${username}/${repo}`)

    // Check if python-files directory exists, if not create it
    try {
      const dirResponse = await fetch(`https://api.github.com/repos/${username}/${repo}/contents/python-files`, {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "PyToExe-Converter",
        },
      })

      if (dirResponse.status === 404) {
        console.log("python-files directory doesn't exist, will be created automatically")
      }
    } catch (error) {
      console.log("Directory check failed, continuing...")
    }

    // Check if file already exists
    let sha = ""
    try {
      const checkResponse = await fetch(`https://api.github.com/repos/${username}/${repo}/contents/${path}`, {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "PyToExe-Converter",
        },
      })

      if (checkResponse.ok) {
        const data = await checkResponse.json()
        sha = data.sha
        console.log(`File exists, will update with SHA: ${sha}`)
      } else if (checkResponse.status === 404) {
        console.log("File doesn't exist, will create new")
      } else {
        console.log(`File check returned: ${checkResponse.status}`)
      }
    } catch (error) {
      console.log("File check failed, continuing...")
    }

    // Upload the file
    const uploadData = {
      message: `Upload ${fileName} via PY to EXE tool`,
      content: Buffer.from(fileContent).toString("base64"),
      ...(sha && { sha }),
    }

    console.log("Uploading file...")
    const uploadResponse = await fetch(`https://api.github.com/repos/${username}/${repo}/contents/${path}`, {
      method: "PUT",
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
        "User-Agent": "PyToExe-Converter",
      },
      body: JSON.stringify(uploadData),
    })

    console.log(`Upload response status: ${uploadResponse.status}`)

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text()
      console.error(`Upload failed with status ${uploadResponse.status}`)
      console.error(`Error response: ${errorText}`)

      // Try to parse the error for more details
      let errorDetails = errorText
      try {
        const errorJson = JSON.parse(errorText)
        errorDetails = errorJson.message || errorText
        if (errorJson.errors) {
          errorDetails += ` - ${JSON.stringify(errorJson.errors)}`
        }
      } catch (e) {
        // Keep original error text
      }

      throw new Error(`GitHub upload failed (${uploadResponse.status}): ${errorDetails}`)
    }

    const uploadResult = await uploadResponse.json()
    console.log("Upload successful!")

    return {
      success: true,
      message: `Successfully uploaded ${fileName} to GitHub repository`,
      data: uploadResult,
    }
  } catch (error) {
    console.error("Error in uploadFileToGithub:", error)
    throw error
  }
}

// Simplified versions of other functions for now
export async function deleteFileFromGithub(fileName: string) {
  throw new Error("Function temporarily disabled for debugging")
}

export async function checkWorkflowStatus(workflowRunId: number) {
  throw new Error("Function temporarily disabled for debugging")
}

export async function getLatestWorkflowRun() {
  throw new Error("Function temporarily disabled for debugging")
}

export async function getWorkflowArtifacts(workflowRunId: number) {
  throw new Error("Function temporarily disabled for debugging")
}

export async function getArtifactDownloadUrl(artifactId: number) {
  throw new Error("Function temporarily disabled for debugging")
}

export async function getGitHubUserInfo(username: string) {
  throw new Error("Function temporarily disabled for debugging")
}
