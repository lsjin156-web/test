/* 출근 기록 — 오프라인 캐시
   앱 껍데기를 통째로 캐시해 두기 때문에, 신호가 없는 정류장에서도
   태그를 찍으면 화면이 뜨고 기록이 남습니다. (기록은 localStorage에 저장) */

const CACHE = "commute-shell-v1";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png"
];

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
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // NFC 태그로 들어온 주소(?event=...)도 캐시된 껍데기로 즉시 응답한다.
  // 네트워크를 기다리지 않으므로 콜드 스타트가 빨라진다.
  if (req.mode === "navigate") {
    e.respondWith(
      caches.match("./index.html").then(hit => hit || fetch(req))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(hit => {
      if (hit) return hit;
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
