import { useEffect, useState } from 'react'
import './App.css'

type Health = { status: string; version: string }

function App() {
  const [health, setHealth] = useState<Health | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/health')
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<Health>
      })
      .then((data) => {
        if (!cancelled) setHealth(data)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="shell">
      <h1>Docket</h1>
      <p className="tagline">System of record for human + agent tasks.</p>
      <section className="panel">
        <h2>API</h2>
        {health && (
          <p>
            <code>{health.status}</code> · v{health.version}
          </p>
        )}
        {error && (
          <p className="err">
            API unreachable ({error}). Start with <code>uv run docket</code>.
          </p>
        )}
        {!health && !error && <p>Checking…</p>}
      </section>
    </main>
  )
}

export default App
