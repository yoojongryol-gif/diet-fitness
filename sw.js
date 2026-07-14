/* diet-fitness 서비스워커 — CDN 대형 자산(MediaPipe 모델·wasm) 캐시 + 오프라인
   주의: VER은 index.html의 APPVER와 함께 올릴 것 (앱 셸 캐시 무효화 기준)
   7/14: CDN 캐시를 앱 버전과 분리(CDN_CACHE 고정) — 종전엔 버전 올릴 때마다 MediaPipe ~10MB
   재다운로드되어 "모델 준비 중" 수십초 = 측정/카메라 먹통처럼 보이던 실사고. CDN URL은
   버전 고정(불변)이라 영구 보존이 맞음. */
const VER = "2026.07.14f";
const CACHE = "df-" + VER;          // 앱 셸(index 등) — 버전마다 갱신
const CDN_CACHE = "df-cdn-v1";      // CDN 불변 자산 — 앱 버전과 무관하게 유지
/* cache-first 대상: 버전 고정 CDN (내용 불변) */
const CDN_HOSTS = ["cdn.jsdelivr.net", "storage.googleapis.com", "unpkg.com"];
/* SW가 손대면 안 되는 것: 분석·OAuth·API·지도타일 (실시간성/인증) */
const BYPASS = ["google-analytics.com", "googletagmanager.com", "accounts.google.com", "googleapis.com", "openstreetmap.org"];

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== CDN_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const u = new URL(req.url);
  const isCdn = CDN_HOSTS.includes(u.hostname);
  if (!isCdn && BYPASS.some(h => u.hostname.endsWith(h))) return;

  /* 페이지(index)는 network-first — 기존 APPVER 자동 새로고침 로직과 공존 */
  const isPage = u.origin === self.location.origin && (u.pathname.endsWith("/") || u.pathname.endsWith(".html"));
  if (req.mode === "navigate" || isPage) {
    e.respondWith(
      fetch(req).then(r => {
        const c = r.clone();
        caches.open(CACHE).then(x => x.put("./", c));
        return r;
      }).catch(() => caches.match("./"))
    );
    return;
  }

  /* CDN + 동일 오리진 정적 자산은 cache-first (CDN은 영구 캐시에) */
  if (isCdn || u.origin === self.location.origin) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(r => {
        if (r && (r.ok || r.type === "opaque")) {
          const c = r.clone();
          caches.open(isCdn ? CDN_CACHE : CACHE).then(x => x.put(req, c));
        }
        return r;
      }))
    );
  }
});
