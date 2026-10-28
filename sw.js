// 서비스 워커: 한 번 받은 게임 파일을 기기에 담아 두어 다시 열 때 빠르고 오프라인에서도 실행되게 한다.
// - index.html(첫 화면)은 항상 네트워크 먼저 → 새 배포를 바로 받음 (못 받으면 담아 둔 것)
// - js/css 는 ?v= 버전이 붙어 있어 주소가 바뀌면 새 파일, 같으면 담아 둔 것을 씀
// - 그림·음악은 담아 둔 것을 먼저 쓰고 뒤에서 새로 받아 둠
// - Firebase 등 다른 사이트 요청과 음악의 부분 요청(Range)은 건드리지 않는다
const CACHE = 'steambeans-v1';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./', './index.html', './manifest.webmanifest'])).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || req.headers.has('range')) return;
  const isPage = req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');
  if (isPage) {
    e.respondWith(fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res; })
      .catch(() => caches.match(req).then(r => r || caches.match('./index.html'))));
    return;
  }
  e.respondWith(caches.match(req).then(hit => {
    const net = fetch(req).then(res => { if (res.ok && res.status === 200) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; }).catch(() => hit);
    return hit || net;
  }));
});
