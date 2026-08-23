import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Schriften selbst gehostet (Abschnitt 2): keine Requests an Google Fonts — in Deutschland
// abmahnfähig. @fontsource legt die woff2-Dateien ins Bundle.
import '@fontsource/barlow-condensed/600.css'
import '@fontsource/barlow-condensed/700.css'
import '@fontsource/barlow/400.css'
import '@fontsource/barlow/500.css'
import '@fontsource/barlow/600.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'

import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
