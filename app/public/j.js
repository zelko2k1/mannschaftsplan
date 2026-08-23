// Schickt das Formular auf der Einladungsseite sofort ab, damit aus dem Klick auf den Link
// direkt der Abfahrtsplan wird. Ohne JavaScript bleibt der sichtbare Knopf — deshalb steht hier
// auch keine Fehlerbehandlung: schlägt das fehl, tippt man eben selbst.
//
// Eigene Datei statt Inline-<script>, weil die CSP aus R9 nur 'self' erlaubt.
// `defer` im <script>-Tag garantiert, dass das Formular hier schon geparst ist.
// (document.currentScript wäre hier null — bei deferred Skripten ist es das immer.)
document.querySelector('main form').submit()
