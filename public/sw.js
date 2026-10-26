// Service worker do Tebras Intelligence.
// Não armazena páginas nem dados em cache: todas as telas exigem sessão e dados atualizados.
// Apenas exibe uma página "sem conexão" quando a navegação falha por falta de rede.
const OFFLINE = "/offline.html";
const CACHE = "tebras-offline-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE, "/icons/icon-192.png"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE)));
});
