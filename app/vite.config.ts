import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// PocketBase im lokalen Entwicklungsbetrieb (scripts/dev-pb.sh).
const PB = 'http://127.0.0.1:8090'

// Im Betrieb liegt das Frontend in PocketBases pb_public, alles läuft also auf EINER Origin —
// Cookies ohne CORS-Gefummel, keine Backend-URL im Bundle. Damit der Dev-Server sich genauso
// verhält, werden die Backend-Pfade hierher durchgereicht statt gegen eine andere Origin zu
// sprechen: sonst würde der Browser die HttpOnly-Session-Cookies aus R2 als Third-Party werten.
//
// NICHT '/admin' proxyen — das ist die React-Route der Kapitänsansicht. Nur '/admin/api'.
const backendPaths = {
  '/j': PB,          // Einladungslink (liefert nur das Formular, siehe R10)
  '/api': PB,        // Mitglieder-API
  '/admin/api': PB,  // Admin-API
  '/_': PB,          // PocketBase-eigene Oberfläche
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // 127.0.0.1 statt 0.0.0.0: Über eine LAN-IP ist die App ohnehin unbenutzbar, weil das
    // `Secure`-Cookie aus R2 dort nicht gesetzt wird. Wer im LAN testen will, nimmt den
    // Homelab-Weg mit HTTPS (siehe deploy/).
    host: '127.0.0.1',
    proxy: backendPaths,
  },
  build: {
    // PocketBase serviert pb_public. Ein `npm run build` reicht damit für den
    // produktionsnahen Same-Origin-Test auf :8090.
    outDir: '../pocketbase/pb_public',
    emptyOutDir: true,
  },
  test: {
    environment: 'node',
    exclude: ['node_modules/**', 'dist/**'],
  },
})
