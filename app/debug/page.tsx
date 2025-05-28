"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { debugGitHubAccess } from "../actions"

export default function DebugPage() {
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const runDebug = async () => {
    setLoading(true)
    try {
      const debugResult = await debugGitHubAccess()
      setResult(debugResult)
    } catch (error) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle>GitHub Access Debug</CardTitle>
        </CardHeader>
        <CardContent>
          <Button onClick={runDebug} disabled={loading}>
            {loading ? "Running Debug..." : "Test GitHub Access"}
          </Button>

          {result && (
            <div className="mt-4">
              <h3 className="text-lg font-semibold mb-2">Debug Result:</h3>
              <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto">{JSON.stringify(result, null, 2)}</pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
