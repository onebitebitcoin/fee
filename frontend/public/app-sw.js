// 이 앱 전용 서비스워커. 실시간 시세·수수료 화면이라 오래된 화면을 보여 주는 것이 가장 큰 위험이므로
// 보수적으로 둔다: 내비게이션은 network-first(오프라인일 때만 캐시), /api/ 는 가로채지 않는다.
// 파일명을 /app-sw.js 로 고정한 이유: 백엔드가 /sw.js 등 흔한 이름을 옛 서비스워커 제거용 kill-switch 로 응답한다.
const CACHE_VERSION = 'v1';
const CACHE_PREFIX = 'exchange-fee-';
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;
const SHELL_KEY = '/';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

async function putIfOk(key, response) {
  if (response && response.ok) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(key, response.clone());
  }
}

// 내비게이션: 네트워크 우선, 실패 시에만 캐시된 index.html
async function handleNavigate(request) {
  try {
    const response = await fetch(request);
    await putIfOk(SHELL_KEY, response);
    return response;
  } catch (error) {
    const cached = await caches.match(SHELL_KEY);
    if (cached) return cached;
    throw error;
  }
}

// /assets/* : 해시 파일명이라 내용이 바뀌면 이름이 바뀐다 → cache-first
async function handleAsset(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  await putIfOk(request, response);
  return response;
}

// 그 밖의 정적 파일(아이콘, manifest 등): 네트워크 우선, 실패 시 캐시
async function handleStatic(request) {
  try {
    const response = await fetch(request);
    await putIfOk(request, response);
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigate(request));
  } else if (url.pathname.startsWith('/assets/')) {
    event.respondWith(handleAsset(request));
  } else if (url.pathname.startsWith('/icons/') || url.pathname === '/manifest.webmanifest') {
    event.respondWith(handleStatic(request));
  }
});
