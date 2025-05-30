"use client"

import type React from "react"
import { useState, useEffect } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Upload,
  Github,
  Loader2,
  Download,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Code,
  Shield,
  Trash2,
  User,
} from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"
import {
  uploadFileToGithub,
  getLatestWorkflowRun,
  checkWorkflowStatus,
  getWorkflowArtifacts,
  getArtifactDownloadUrl,
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

    // Set up polling interval (every 5 seconds to avoid rate limits)
    intervalId = setInterval(checkStatus, 5000)

    // Clean up interval on unmount
    return () => clearInterval(intervalId)
  }, [workflowId, onComplete, fileName])

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

      // Function to truncate filename if too long
      const truncateFilename = (filename: string, maxLength = 30) => {
        if (filename.length <= maxLength) return filename
        const extension = filename.split(".").pop()
        const nameWithoutExt = filename.substring(0, filename.lastIndexOf("."))
        const truncatedName = nameWithoutExt.substring(0, maxLength - extension!.length - 3) + "..."
        return `${truncatedName}.${extension}`
      }

      setMessage({
        type: "success",
        title: "Upload Successful",
        text: `Successfully uploaded ${truncateFilename(file.name)} to GitHub repository`,
      })

      // Store auth token for artifact download
      if (result.auth) {
        setAuthToken(result.auth)
      }

      // Wait 10 seconds before checking workflow to avoid rate limits
      setProcessingStep("waiting")
      await new Promise((resolve) => setTimeout(resolve, 10000))

      // Get latest workflow run
      setProcessingStep("checking_workflow")
      try {
        const latestWorkflow = await getLatestWorkflowRun()
        setWorkflowId(latestWorkflow.id)

        setMessage({
          type: "success",
          title: "Workflow Started",
          text: `Workflow started with ID: ${latestWorkflow.id}. The conversion process will take a few minutes.`,
        })
      } catch (workflowError) {
        console.error("Workflow error:", workflowError)
        setMessage({
          type: "error",
          title: "Workflow Error",
          text: `Could not get workflow status: ${workflowError instanceof Error ? workflowError.message : "Unknown error"}. File was uploaded successfully.`,
        })
        setProcessingStep("error")
        return
      }

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
          {/* Static header instead of dynamic GitHub user info */}
          <div className="flex items-center self-start mb-2">
            <div className="h-10 w-10 rounded-full mr-3 overflow-hidden">
              <Image
                src="https://github.com/eroge69.png"
                alt="GitHub Avatar"
                width={40}
                height={40}
                className="object-cover"
              />
            </div>
            <div>
              <h2 className="text-sm font-medium"> unamed666</h2>
              <span className="text-xs text-muted-foreground hover:underline">
                <a href="https://github.com/eroge69" target="_blank" rel="noopener noreferrer">
                  <b>@eroge69</b>
                </a>
              </span>
            </div>
          </div>

          <div className="flex flex-col items-center">
            <h1 className="text-3xl font-bold text-center">PY to EXE</h1>
            <h1>Online Converter</h1>
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
              <div className="mt-2 text-sm text-center break-words px-2">
                Selected:{" "}
                <span className="font-medium">
                  {file.name.length > 30
                    ? `${file.name.substring(0, 20)}...${file.name.substring(file.name.length - 7)}`
                    : file.name}
                </span>
              </div>
            )}

            <div className="mt-2 text-xs text-center text-muted-foreground">
              <div className="flex items-center justify-center gap-1">
                <Trash2 className="h-3 w-3" />
                <span>PY files will be removed from repo after process</span>
              </div>
            </div>
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
              <AlertDescription className="break-words">{message.text}</AlertDescription>
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

      {/* Security Information */}
      <div className="mt-6 w-full max-w-md p-4 border rounded-md bg-muted/30">
        <div className="flex items-center gap-2 mb-2">
          <Shield className="h-5 w-5 text-green-500" />
          <h3 className="font-medium">Security Information</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          For users concerned about security, you can review our source code in both repositories:
        </p>
        <div className="space-y-2">
          <a
            href="https://github.com/eroge69/PytoexeWeb"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <Code className="h-4 w-4" />
            Web Interface Repository
          </a>
          <a
            href="https://github.com/eroge-69/PyToExe"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <Github className="h-4 w-4" />
            Python-to-EXE Processing Repository
          </a>
        </div>
      </div>

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
            <li>Open source - code available for review</li>
          </ul>
        </div>
      </div>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        Your Python files will be uploaded to the{" "}
        <a href="https://github.com/eroge69/PyToExe/tree/main/python-files" target="_blank" rel="noopener noreferrer">
          <b>PyToExe repository</b>
        </a>{" "}
        where they will be processed by GitHub Actions to create executable files.
      </p>

      <footer className="mt-12 mb-6 text-center text-xs text-muted-foreground">
        <p>© {new Date().getFullYear()} PY to EXE Online Converter. All rights reserved.</p>
        <div className="mt-2 flex flex-col items-center gap-2">
          <div className="flex gap-4">
            <a
              href="https://github.com/eroge69/PytoexeWeb"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              Web Interface Source
            </a>
            <span>•</span>
            <a
              href="https://github.com/eroge69/PyToExe"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              Converter Source
            </a>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            This application uses two repositories: one for the web interface and one for the Python-to-EXE conversion
            process.
          </p>

          {/* Powered by Vercel */}
          <div className="mt-4 flex items-center justify-center">
            <span className="text-xs text-muted-foreground mr-2">Powered by</span>
            <a href="https://vercel.com" target="_blank" rel="noopener noreferrer" className="flex items-center">
              <svg height="16" viewBox="0 0 283 64" fill="currentColor">
                <path d="M141.04 16c-11.04 0-19 7.2-19 18s8.96 18 20 18c6.67 0 12.55-2.64 16.19-7.09l-7.65-4.42c-2.02 2.21-5.09 3.5-8.54 3.5-4.79 0-8.86-2.5-10.37-6.5h28.02c.22-1.12.35-2.28.35-3.5 0-10.79-7.96-17.99-19-17.99zm-9.46 14.5c1.25-3.99 4.67-6.5 9.45-6.5 4.79 0 8.21 2.51 9.45 6.5h-18.9zM248.72 16c-11.04 0-19 7.2-19 18s8.96 18 20 18c6.67 0 12.55-2.64 16.19-7.09l-7.65-4.42c-2.02 2.21-5.09 3.5-8.54 3.5-4.79 0-8.86-2.5-10.37-6.5h28.02c.22-1.12.35-2.28.35-3.5 0-10.79-7.96-17.99-19-17.99zm-9.45 14.5c1.25-3.99 4.67-6.5 9.45-6.5 4.79 0 8.21 2.51 9.45 6.5h-18.9zM200.24 34c0 6 3.92 10 10 10 4.12 0 7.21-1.87 8.8-4.92l7.68 4.43c-3.18 5.3-9.14 8.49-16.48 8.49-11.05 0-19-7.2-19-18s7.96-18 19-18c7.34 0 13.29 3.19 16.48 8.49l-7.68 4.43c-1.59-3.05-4.68-4.92-8.8-4.92-6.07 0-10 4-10 10zm82.48-29v46h-9V5h9zM36.95 0L73.9 64H0L36.95 0zm92.38 5l-27.71 48L73.91 5H84.3l17.32 30 17.32-30h10.39zm58.91 12v9.69c-1-.29-2.06-.49-3.2-.49-5.81 0-10 4-10 10V51h-9V17h9v9.2c0-5.08 5.91-9.2 13.2-9.2z" />
              </svg>
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
