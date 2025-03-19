"use client"

import type React from "react"
import { useState, useEffect } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Upload, Github, Loader2, Download, CheckCircle, XCircle, Clock, RefreshCw, Trash2 } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"
import {
  uploadFileToGithub,
  getLatestWorkflowRun,
  checkWorkflowStatus,
  getWorkflowArtifacts,
  getArtifactDownloadUrl,
  deleteFileFromGithub,
  getGitHubUserInfo,
} from "./actions"

// Workflow status component
function WorkflowStatus({
  workflowId,
  onComplete,
  fileName,
}: {
  workflowId: number
  onComplete: (artifacts: any[]) => void
  fileName: string
}) {
  const [status, setStatus] = useState<string>("pending")
  const [progress, setProgress] = useState<number>(0)
  const [conclusion, setConclusion] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState<boolean>(false)
  const [fileDeleted, setFileDeleted] = useState<boolean>(false)

  // Poll for workflow status updates
  useEffect(() => {
    let intervalId: NodeJS.Timeout
    let attempts = 0
    const maxAttempts = 60 // 5 minutes (5s intervals)

    const checkStatus = async () => {
      try {
        setRefreshing(true)
        const workflowData = await checkWorkflowStatus(workflowId)
        setStatus(workflowData.status)

        // Calculate progress based on status
        if (workflowData.status === "completed") {
          setProgress(100)
          setConclusion(workflowData.conclusion)

          // Get artifacts if workflow completed successfully
          if (workflowData.conclusion === "success") {
            const artifacts = await getWorkflowArtifacts(workflowId)
            onComplete(artifacts)

            // Delete the Python file after successful workflow
            if (!fileDeleted && fileName) {
              try {
                await deleteFileFromGithub(fileName)
                setFileDeleted(true)
                console.log(`Successfully deleted ${fileName}`)
              } catch (error) {
                console.error(`Error deleting file ${fileName}:`, error)
              }
            }
          }

          // Clear interval when completed
          clearInterval(intervalId)
        } else if (workflowData.status === "in_progress") {
          // Estimate progress (increases over time)
          setProgress(Math.min(90, 10 + attempts * 5))
        } else {
          setProgress(10) // Just started
        }

        attempts++

        // Stop polling after max attempts
        if (attempts >= maxAttempts) {
          clearInterval(intervalId)
          setError("Timed out waiting for workflow to complete")
        }
      } catch (error) {
        console.error("Error checking workflow status:", error)
        setError(error instanceof Error ? error.message : "Error checking workflow status")
      } finally {
        setRefreshing(false)
      }
    }

    // Initial check
    checkStatus()

    // Set up polling interval (every 5 seconds)
    intervalId = setInterval(checkStatus, 5000)

    // Clean up interval on unmount
    return () => clearInterval(intervalId)
  }, [workflowId, onComplete, fileName, fileDeleted])

  // Status indicator
  const getStatusIndicator = () => {
    if (status === "completed") {
      if (conclusion === "success") {
        return <CheckCircle className="h-5 w-5 text-green-500" />
      } else {
        return <XCircle className="h-5 w-5 text-red-500" />
      }
    } else if (status === "in_progress") {
      return <Clock className="h-5 w-5 text-blue-500" />
    } else {
      return <Clock className="h-5 w-5 text-gray-500" />
    }
  }

  // Status text
  const getStatusText = () => {
    if (status === "completed") {
      return conclusion === "success" ? "Completed successfully" : `Failed: ${conclusion}`
    } else if (status === "in_progress") {
      return "In progress..."
    } else {
      return "Waiting to start..."
    }
  }

  const handleRefresh = async () => {
    try {
      setRefreshing(true)
      // Fetch the workflow status again
      const workflowData = await checkWorkflowStatus(workflowId!)
      setStatus(workflowData.status)
      setConclusion(workflowData.conclusion)

      if (workflowData.status === "completed" && workflowData.conclusion === "success") {
        const artifacts = await getWorkflowArtifacts(workflowId!)
        onComplete(artifacts)

        // Delete the Python file after successful workflow
        if (!fileDeleted && fileName) {
          try {
            await deleteFileFromGithub(fileName)
            setFileDeleted(true)
            console.log(`Successfully deleted ${fileName}`)
          } catch (error) {
            console.error(`Error deleting file ${fileName}:`, error)
          }
        }
      }
    } catch (error) {
      console.error("Error refreshing workflow status:", error)
      setError(error instanceof Error ? error.message : "Error refreshing workflow status")
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="mt-4 p-3 border rounded-md">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {getStatusIndicator()}
          <span className="text-sm font-medium">Workflow Status: {getStatusText()}</span>
        </div>
        <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={refreshing || status === "completed"}>
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <Progress value={progress} className="h-2 mb-2" />

      <div className="flex justify-between items-center">
        <div className="text-xs text-muted-foreground">Workflow ID: {workflowId}</div>
        {fileDeleted && (
          <div className="text-xs flex items-center text-green-500">
            <Trash2 className="h-3 w-3 mr-1" />
            Python file deleted
          </div>
        )}
      </div>

      {error && <div className="mt-2 text-xs text-red-500">{error}</div>}
    </div>
  )
}

export default function PyToExeConverter() {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error" | "info"; title: string; text: string } | null>(
    null,
  )
  const [workflowId, setWorkflowId] = useState<number | null>(null)
  const [artifacts, setArtifacts] = useState<any[]>([])
  const [authToken, setAuthToken] = useState<string>("")
  const [processingStep, setProcessingStep] = useState<string>("idle")
  const [downloading, setDownloading] = useState<boolean>(false)
  const [uploadedFileName, setUploadedFileName] = useState<string>("")
  const [userInfo, setUserInfo] = useState<any>(null)

  // Fetch GitHub user info on component mount
  useEffect(() => {
    async function fetchUserInfo() {
      try {
        const info = await getGitHubUserInfo("eroge69")
        setUserInfo(info)
      } catch (error) {
        console.error("Error fetching user info:", error)
      }
    }

    fetchUserInfo()
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0]
      if (selectedFile.name.endsWith(".py")) {
        setFile(selectedFile)
        setMessage(null)
        // Reset workflow state when a new file is selected
        setWorkflowId(null)
        setArtifacts([])
        setProcessingStep("idle")
        setUploadedFileName("")
      } else {
        setFile(null)
        setMessage({
          type: "error",
          title: "Invalid File",
          text: "Please select a Python (.py) file",
        })
      }
    }
  }

  const handleUpload = async () => {
    if (!file) {
      setMessage({
        type: "error",
        title: "No File Selected",
        text: "Please select a file first",
      })
      return
    }

    setUploading(true)
    setMessage(null)
    setProcessingStep("uploading")

    try {
      // Read file content
      const content = await file.text()

      // Save the file name for later deletion
      setUploadedFileName(file.name)

      // Call the server action to upload file
      const result = await uploadFileToGithub(content, file.name)

      setMessage({
        type: "success",
        title: "Upload Successful",
        text: result.message,
      })

      // Store auth token for artifact download
      if (result.auth) {
        setAuthToken(result.auth)
      }

      // Wait 4 seconds before checking workflow
      setProcessingStep("waiting")
      await new Promise((resolve) => setTimeout(resolve, 4000))

      // Get latest workflow run
      setProcessingStep("checking_workflow")
      const latestWorkflow = await getLatestWorkflowRun()
      setWorkflowId(latestWorkflow.id)

      // Reset file input
      setFile(null)
      const fileInput = document.getElementById("file-upload") as HTMLInputElement
      if (fileInput) fileInput.value = ""

      setProcessingStep("monitoring")
    } catch (error) {
      console.error("Error in process:", error)
      setMessage({
        type: "error",
        title: "Process Failed",
        text: error instanceof Error ? error.message : "Failed to complete the process",
      })
      setProcessingStep("error")
    } finally {
      setUploading(false)
    }
  }

  const handleWorkflowComplete = (workflowArtifacts: any[]) => {
    setArtifacts(workflowArtifacts)
    setProcessingStep("completed")
  }

  const downloadArtifact = async (artifact: any) => {
    try {
      setDownloading(true)

      // Show loading message
      setMessage({
        type: "info",
        title: "Downloading",
        text: `Preparing download for ${artifact.name}...`,
      })

      // Get the artifact data using server action
      const result = await getArtifactDownloadUrl(artifact.id)

      if (result.success) {
        // Convert base64 to blob
        const binaryString = atob(result.data)
        const bytes = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i)
        }
        const blob = new Blob([bytes], { type: result.contentType })

        // Create download link
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = result.filename
        document.body.appendChild(a)
        a.click()

        // Clean up
        URL.revokeObjectURL(url)
        document.body.removeChild(a)

        setMessage({
          type: "success",
          title: "Download Complete",
          text: `Successfully downloaded ${artifact.name}`,
        })
      }
    } catch (error) {
      console.error("Error downloading artifact:", error)
      setMessage({
        type: "error",
        title: "Download Failed",
        text: error instanceof Error ? error.message : "Failed to download artifact",
      })
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md p-6">
        <div className="flex flex-col items-center space-y-6">
          {/* GitHub User Info */}
          {userInfo && (
            <div className="flex items-center self-start mb-2">
              <div className="relative h-10 w-10 overflow-hidden rounded-full mr-3">
                <Image
                  src={userInfo.avatar_url || "/placeholder.svg"}
                  alt={userInfo.name}
                  fill
                  className="object-cover"
                />
              </div>
              <div>
                <h2 className="text-sm font-medium">{userInfo.name}</h2>
                <a
                  href={userInfo.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:underline"
                >
                  @{userInfo.html_url.split("/").pop()}
                </a>
              </div>
            </div>
          )}

          <div className="flex flex-col items-center">
            <h1 className="text-3xl font-bold text-center">PY to EXE</h1>
            <div className="relative w-24 h-24 mt-2 mb-4">
              <Image src="/Python-Symbol.png" alt="Python Logo" fill className="object-contain" priority />
            </div>
          </div>

          <div className="w-full">
            <div className="flex items-center justify-center w-full">
              <label
                htmlFor="file-upload"
                className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer bg-muted/50 hover:bg-muted"
              >
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <Upload className="w-8 h-8 mb-2 text-muted-foreground" />
                  <p className="mb-2 text-sm text-muted-foreground">
                    <span className="font-semibold">Click to upload</span> or drag and drop
                  </p>
                  <p className="text-xs text-muted-foreground">Python file (.py)</p>
                </div>
                <Input id="file-upload" type="file" accept=".py" className="hidden" onChange={handleFileChange} />
              </label>
            </div>

            {file && (
              <div className="mt-2 text-sm text-center">
                Selected: <span className="font-medium">{file.name}</span>
              </div>
            )}
          </div>

          <Button
            onClick={handleUpload}
            disabled={!file || uploading || processingStep === "monitoring"}
            className="w-full"
          >
            {uploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {processingStep === "uploading"
                  ? "Uploading..."
                  : processingStep === "waiting"
                    ? "Waiting..."
                    : processingStep === "checking_workflow"
                      ? "Checking Workflow..."
                      : "Processing..."}
              </>
            ) : (
              <>
                <Github className="mr-2 h-4 w-4" />
                Upload to GitHub
              </>
            )}
          </Button>

          {message && (
            <Alert
              className={
                message.type === "error"
                  ? "border-destructive"
                  : message.type === "info"
                    ? "border-blue-500"
                    : "border-success"
              }
            >
              <AlertTitle>{message.title}</AlertTitle>
              <AlertDescription>{message.text}</AlertDescription>
            </Alert>
          )}

          {/* Workflow Status */}
          {workflowId && (
            <WorkflowStatus workflowId={workflowId} onComplete={handleWorkflowComplete} fileName={uploadedFileName} />
          )}

          {/* Artifacts Download Section */}
          {artifacts.length > 0 && (
            <div className="w-full mt-4">
              <h3 className="text-sm font-medium mb-2">Download Files:</h3>
              <div className="space-y-2">
                {artifacts.map((artifact) => (
                  <Button
                    key={artifact.id}
                    variant="outline"
                    className="w-full flex items-center justify-between"
                    onClick={() => downloadArtifact(artifact)}
                    disabled={downloading}
                  >
                    <span className="truncate">{artifact.name}</span>
                    {downloading ? (
                      <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4 ml-2" />
                    )}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* SEO-friendly content section */}
      <div className="mt-8 max-w-2xl text-center">
        <h2 className="text-xl font-semibold mb-4">Convert Python to EXE Online - Free and Easy</h2>
        <div className="text-sm text-muted-foreground space-y-4">
          <p>
            PY to EXE is a free online tool that converts Python (.py) files to executable (.exe) files. No installation
            required - just upload your Python script and download the executable file.
          </p>
          <p>
            Our online Python to EXE converter is perfect for developers who want to distribute their Python
            applications to users who don't have Python installed. The generated executable files work on Windows
            without requiring any additional dependencies.
          </p>
          <p>
            Simply upload your Python file, wait for the conversion process to complete, and download your executable
            file. It's that easy!
          </p>
          <h3 className="text-lg font-medium mt-6 mb-2">Features of our Python to EXE Converter</h3>
          <ul className="list-disc list-inside text-left mx-auto max-w-md">
            <li>Free to use - no registration required</li>
            <li>Secure conversion process</li>
            <li>Works with all Python versions</li>
            <li>Fast conversion time</li>
            <li>No installation needed - works in your browser</li>
            <li>Creates standalone executable files</li>
          </ul>
        </div>
      </div>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        This tool uploads Python files to your GitHub repository and converts them to executable files.
      </p>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        The file will be uploaded to{" "}
        <a href="https://github.com/eroge69/PyToExe/tree/main/python-files" target="_blank" rel="noopener noreferrer">
          <b> THIS REPOSITORY</b>
        </a>
      </p>

      <footer className="mt-12 mb-6 text-center text-xs text-muted-foreground">
        <p>© {new Date().getFullYear()} PY to EXE Online Generator. All rights reserved.</p>
      </footer>
    </div>
  )
}

