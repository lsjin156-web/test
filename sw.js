/* 출근 기록 — 오프라인 캐시 (자동 갱신형)
 *
 * 캐시된 화면을 즉시 띄워서 콜드 스타트를 빠르게 유지하면서,
 * 뒤에서 조용히 최신 파일을 받아 캐시를 바꿔치기한다.
 * 그래서 index.html만 다시 올리면 앱이 알아서 새 버전을 집어간다.
 * 이 파일은 앞으로 다시 올릴 일이 없다. */

const CACHE = "commute-shell";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png"
];

const shellRequest = () =>
  new Request(self.location.href.replace(/sw\.js.*$/, "index.html"));

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

async function tell(msg) {
  const clients = await self.clients.matchAll({ type: "window" });
  clients.forEach(c => c.postMessage(msg));
}

/* 캐시된 응답을 돌려준 뒤, 뒤에서 새 파일을 받아 바뀌었으면 교체한다. */
async function revalidate(request, cachedResponse, notify) {
  try {
    const fresh = await fetch(request, { cache: "no-cache" });
    if (!fresh || !fresh.ok) return;

    if (cachedResponse) {
      const [a, b] = await Promise.all([
        cachedResponse.clone().text(),
        fresh.clone().text()
      ]);
      if (a === b) return;              // 내용이 같으면 아무 일도 하지 않는다
    }

    const cache = await caches.open(CACHE);
    await cache.put(request, fresh.clone());

    // 루트 경로와 index.html은 같은 화면이므로 함께 맞춰 둔다
    const url = new URL(request.url);
    if (url.pathname.endsWith("/") || url.pathname.endsWith("/index.html")) {
      const base = url.origin + url.pathname.replace(/index\.html$/, "");
      await cache.put(new Request(base), fresh.clone());
      await cache.put(new Request(base + "index.html"), fresh.clone());
    }

    if (notify) await tell({ type: "update-ready" });
  } catch (err) {
    /* 오프라인이면 그냥 캐시된 화면을 계속 쓴다 */
  }
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 화면 진입(NFC 태그 포함): 캐시를 즉시 띄우고, 갱신은 뒤에서
  if (req.mode === "navigate") {
    const shell = shellRequest();
    e.respondWith(
      caches.match(shell).then(hit => {
        if (hit) {
          e.waitUntil(revalidate(shell, hit, true));
          return hit;
        }
        return fetch(req);
      })
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(hit => {
      if (hit) {
        e.waitUntil(revalidate(req, hit, false));
        return hit;
      }
      return fetch(req).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => hit);
    })
  );
});

/* 앱이 직접 갱신을 요청할 때 */
self.addEventListener("message", e => {
  if (e.data === "check-update") {
    const shell = shellRequest();
    e.waitUntil(
      caches.match(shell).then(hit => revalidate(shell, hit, true))
    );
  }
});
