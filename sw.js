const CACHE = "volleystats-shell-v4";
const CACHE_PREFIXES = ["volleytrack-shell-", "volleystats-shell-"];

const ASSETS = [
  "./",
  "./index.html",
  "./src/app.js",
  "./src/domain.js",
  "./src/statistics.js",
  "./src/corrections.js",
  "./src/storage.js",
  "./src/styles.css",
  "./icon.svg",
  "./manifest.webmanifest",
];

self.addEventListener("install", (event) =>
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS))),
);

self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key !== CACHE &&
                CACHE_PREFIXES.some((prefix) => key.startsWith(prefix)),
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);

self.addEventListener("fetch", (event) => {
  if (
    event.request.method !== "GET" ||
    new URL(event.request.url).origin !== self.location.origin
  )
    return;

  event.respondWith(
    fetch(event.request).catch(() =>
      caches.open(CACHE).then((cache) =>
        cache.match(event.request).then(
          (response) =>
            response ||
            (event.request.mode === "navigate"
              ? cache.match("./index.html")
              : Response.error()),
        ),
      ),
    ),
  );
});
