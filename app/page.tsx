"use client"

import type React from "react"

import { useState } from "react"
import {
  uploadFileToGithub,
  getLatestWorkflowRun,
  checkWorkflowStatus,
  getWorkflowArtifacts,
  getArtifactDownloadUrl,
} from "@/app/actions"

export default function Home() {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; title: string; text: string } | null>(null)
  const [processingStep, setProcessingStep] = useState<"uploading" | "workflow" | "download" | "error" | null>(null)
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null)
  const [workflowRunId, setWorkflowRunId] = useState<number | null>(null)
  const [artifactName, setArtifactName] = useState<string | null>(null)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setFile(event.target.files[0])
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
      const content = await file.text()
      setUploadedFileName(file.name)

      // Add error boundary around Server Action call
      const result = await uploadFileToGithub(content, file.name).catch((error) => {
        console.error("Server Action Error:", error)
        throw new Error(`Upload failed: ${error.message}`)
      })

      if (!result?.success) {
        throw new Error(result?.error || "Failed to upload file")
      }

      setProcessingStep("workflow")
      const workflowResult = await getLatestWorkflowRun().catch((error) => {
        console.error("Server Action Error:", error)
        throw new Error(`Failed to get workflow run: ${error.message}`)
      })

      if (!workflowResult?.success) {
        throw new Error(workflowResult?.error || "Failed to get workflow run")
      }

      setWorkflowRunId(workflowResult.workflowRun?.id || null)

      // Poll for workflow completion (simplified for example)
      let workflowStatus = "pending"
      let attempts = 0
      while (workflowStatus !== "completed" && attempts < 10) {
        attempts++
        await new Promise((resolve) => setTimeout(resolve, 3000)) // Wait 3 seconds
        const statusResult = await checkWorkflowStatus(workflowResult.workflowRun?.id || 0).catch((error) => {
          console.error("Server Action Error:", error)
          throw new Error(`Failed to check workflow status: ${error.message}`)
        })

        if (!statusResult?.success) {
          throw new Error(statusResult?.error || "Failed to check workflow status")
        }
        workflowStatus = statusResult.status
      }

      if (workflowStatus !== "completed") {
        throw new Error("Workflow did not complete in time")
      }

      setProcessingStep("download")
      const artifactsResult = await getWorkflowArtifacts(workflowResult.workflowRun?.id || 0).catch((error) => {
        console.error("Server Action Error:", error)
        throw new Error(`Failed to get workflow artifacts: ${error.message}`)
      })

      if (!artifactsResult?.success) {
        throw new Error(artifactsResult?.error || "Failed to get workflow artifacts")
      }

      if (artifactsResult.artifacts && artifactsResult.artifacts.length > 0) {
        setArtifactName(artifactsResult.artifacts[0].name)
        const downloadResult = await getArtifactDownloadUrl(artifactsResult.artifacts[0].id).catch((error) => {
          console.error("Server Action Error:", error)
          throw new Error(`Failed to get artifact download URL: ${error.message}`)
        })

        if (!downloadResult?.success) {
          throw new Error(downloadResult?.error || "Failed to get artifact download URL")
        }
        setDownloadUrl(downloadResult.downloadUrl)
      } else {
        throw new Error("No artifacts found")
      }

      setMessage({
        type: "success",
        title: "Process Complete",
        text: "File uploaded, workflow complete, artifact ready for download",
      })
      setProcessingStep(null)
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

  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-2">
      <h1 className="text-3xl font-bold mb-4">GitHub Actions File Uploader</h1>

      <input type="file" onChange={handleFileChange} className="mb-4" />

      <button
        onClick={handleUpload}
        disabled={uploading || !file}
        className={`bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline ${
          uploading || !file ? "opacity-50 cursor-not-allowed" : ""
        }`}
      >
        {uploading ? "Uploading..." : "Upload File"}
      </button>

      {message && (
        <div
          className={`mt-4 p-3 rounded-md ${message.type === "success" ? "bg-green-200 text-green-800" : "bg-red-200 text-red-800"}`}
        >
          <strong className="font-bold">{message.title}:</strong> {message.text}
        </div>
      )}

      {processingStep && <div className="mt-4">Processing Step: {processingStep}</div>}

      {workflowRunId && <div className="mt-4">Workflow Run ID: {workflowRunId}</div>}

      {artifactName && <div className="mt-4">Artifact Name: {artifactName}</div>}

      {downloadUrl && (
        <div className="mt-4">
          <a href={downloadUrl} className="text-blue-500" target="_blank" rel="noopener noreferrer">
            Download Artifact
          </a>
        </div>
      )}
    </div>
  )
}
