"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Upload, Github, Loader2, Download, CheckCircle, XCircle, Clock, RefreshCw } from "lucide-react"
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
}: {
  workflowId: number
  onComplete: (artifacts: any[]) => void
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

    // Set up polling interval (every 5 seconds)
    intervalId = setInterval(checkStatus, 5000)

    // Clean up interval on unmount
    return () => clearInterval(intervalId)
  }, [workflowId, onComplete])

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

      <div className="text-xs text-muted-foreground">Workflow ID: {workflowId}</div>

      {error && <div className="mt-2 text-xs text-red-500">{error}</div>}
    </div>
  )
}

export default function PyToExeConverter() {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; title: string; text: string } | null>(null)
  const [workflowId, setWorkflowId] = useState<number | null>(null)
  const [artifacts, setArtifacts] = useState<any[]>([])
  const [authToken, setAuthToken] = useState<string>("")
  const [processingStep, setProcessingStep] = useState<string>("idle")
  const [downloading, setDownloading] = useState<boolean>(false)

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
          <h1 className="text-3xl font-bold text-center">PY to EXE</h1>

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
            <Alert className={message.type === "error" ? "border-destructive" : "border-success"}>
              <AlertTitle>{message.title}</AlertTitle>
              <AlertDescription>{message.text}</AlertDescription>
            </Alert>
          )}

          {/* Workflow Status */}
          {workflowId && <WorkflowStatus workflowId={workflowId} onComplete={handleWorkflowComplete} />}

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

      <p className="mt-8 text-center text-sm text-muted-foreground">
        This tool uploads Python files to your GitHub repository and converts them to executable files.
      </p>

      <p></p>
      
      <p className="mt-8 text-center text-sm text-muted-foreground">
        The file is uploaded to <a href="https://github.com/eroge69/PyToExe/tree/main/python-files" target="_blank"><b> THIS REPOSITORY</b></a>
      </p>

      <p></p>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        <a href="https://github.com/eroge69/" target="_blank"><b> UNAMED666</b></a>


      </p>
    </div>
  )
}

