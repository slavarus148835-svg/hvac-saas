# Чеклист перед публикацией

## Переменные окружения

- Задать `NEXT_PUBLIC_APP_URL` (или `NEXT_PUBLIC_SITE_URL`) на продакшен-домен с `https://`.
- На Vercel при отсутствии переменной для публичного origin подставляется `VERCEL_URL` (только для serverless); для постоянного домена всё равно задайте `NEXT_PUBLIC_APP_URL`.
- Заполнить `NEXT_PUBLIC_FIREBASE_*` из консоли Firebase (или оставить дефолты из репозитория только для теста).
- Для серверных API с Firestore: `FIREBASE_SERVICE_ACCOUNT_JSON`.
- Для оплат: `TBANK_TERMINAL_KEY`, `TBANK_PASSWORD`; при необходимости `TBANK_WEBHOOK_URL`.

## Firebase Console

- **Authentication → Settings → Authorized domains**: добавить продакшен-домен и домен хостинга (например `*.vercel.app` при деплое на Vercel).
- Убедиться, что шаблоны писем и ссылки подтверждения почты ведут на ваш домен (используется `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_SITE_URL` и путь `/verify-email`).

## Проверка сценариев

- Главная `/` открывается без входа.
- `/login`, `/register` доступны гостю.
- Приватные разделы (`/dashboard`, `/calculator`, `/billing`, и т.д.) перенаправляют на `/login?next=…`.
- После входа выполняется переход на запрошенный раздел или в кабинет.
- Обновление страницы в приватном разделе не сбрасывает доступ при активной сессии.
- `npm run build` проходит без ошибок.
