import { useEffect, useState } from 'react'

// Schritt 1 („Gerüst"): Diese Seite hat noch keine Fachlichkeit. Sie belegt genau zwei Dinge —
// das Frontend baut und läuft, und der Weg zum Backend steht (im Entwicklungsbetrieb über den
// Vite-Proxy, im Betrieb same-origin aus pb_public). Der Abfahrtsplan kommt in Schritt 5.

type Backend = 'prüft' | 'erreichbar' | 'nicht erreichbar'

export default function App() {
  const [backend, setBackend] = useState<Backend>('prüft')

  useEffect(() => {
    const abbruch = new AbortController()
    fetch('/api/health', { signal: abbruch.signal })
      .then((r) => setBackend(r.ok ? 'erreichbar' : 'nicht erreichbar'))
      .catch(() => setBackend('nicht erreichbar'))
    return () => abbruch.abort()
  }, [])

  return (
    <main style={{ maxWidth: '40rem', margin: '0 auto', padding: '0 1rem 2rem' }}>
      <header
        style={{
          background: 'var(--gelb)',
          borderBottom: 'var(--linie)',
          margin: '0 -1rem 1.5rem',
          padding: '0.75rem 1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: '1rem',
          fontFamily: 'var(--schrift-eng)',
          fontWeight: 700,
          letterSpacing: '0.03em',
          textTransform: 'uppercase',
        }}
      >
        <span style={{ fontSize: '1.5rem' }}>Mannschaftsplan</span>
        <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Gerüst</span>
      </header>

      <p style={{ marginTop: 0 }}>
        Das Gerüst steht. Spielplan, Rückmeldung und Fahrdienst folgen in den nächsten Schritten.
      </p>

      <p style={{ fontFamily: 'var(--schrift-mono)', fontSize: '0.85rem', color: 'var(--grau)' }}>
        Backend:{' '}
        <span style={{ color: backend === 'nicht erreichbar' ? 'var(--rot)' : 'inherit' }}>
          {backend}
        </span>
      </p>

      {backend === 'nicht erreichbar' && (
        <p style={{ color: 'var(--rot)', fontSize: '0.9rem' }}>
          Läuft <code>./scripts/dev-pb.sh</code>?
        </p>
      )}
    </main>
  )
}
