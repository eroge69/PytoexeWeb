import { testGitHubConnection } from "./action"

export default function TestGitHub() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Test GitHub Connection</h1>
      <form action={testGitHubConnection}>
        <button type="submit" className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
          Test GitHub API
        </button>
      </form>
    </div>
  )
}
