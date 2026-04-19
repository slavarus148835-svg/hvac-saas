# DEPLOY CHECKLIST (Vercel + Firebase)

## 1) Что заполнить в Vercel (Project Settings -> Environment Variables)

### Public variables (`NEXT_PUBLIC_*`)
- `NEXT_PUBLIC_APP_URL` = `https://<ваш-домен>` (без `/` в конце)
- `NEXT_PUBLIC_SITE_URL` = `https://<ваш-домен>` (можно дублировать `NEXT_PUBLIC_APP_URL`)
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_SUPPORT_URL` = ссылка поддержки (например `https://t.me/<username>`)

### Server-only variables
- `FIREBASE_SERVICE_ACCOUNT_JSON` (JSON service account в одну строку)
- `TBANK_TERMINAL_KEY`
- `TBANK_PASSWORD`
- `TBANK_TAXATION` (например `usn_income`)
- `TBANK_WEBHOOK_URL` (опционально; если не задан, используется `<NEXT_PUBLIC_APP_URL>/api/tbank/webhook`)
- `TELEGRAM_BOT_TOKEN` (опционально)
- `TELEGRAM_CHAT_ID` (опционально)

## 2) Firebase Auth -> Authorized domains

Добавить:
- ваш основной домен (пример: `hvac.example.ru`)
- preview/production домен Vercel (пример: `hvac-saas.vercel.app`)

После этого registration/login/email verification будут корректно работать на проде.

## 3) Firestore rules

Опубликовать файл `firestore.rules` из репозитория (без ослабления):
- `users/{uid}`: read/write только владельцу (`request.auth.uid == uid`)
- `priceLists/{uid}`: read/write только владельцу
- `calculationHistory` и `extraServices`: доступ только к документам с `uid` текущего пользователя
- `paymentOrders` и `paymentFunnel`: доступ с клиента запрещен (`false`)

## 4) Перед отправкой ссылки мастерам

1. Сделать деплой на Vercel.
2. Проверить `https://<ваш-домен>/` (landing открывается без логина).
3. Проверить регистрацию, вход и подтверждение email.
4. Проверить приватные разделы (`/dashboard`, `/calculator`, `/history`, `/billing`, `/profile`, `/services`) без логина -> редирект на `/login`.
5. Проверить оплату: только тариф `1190 ₽ / месяц`, успешный возврат в `/dashboard`.

## 5) Какую ссылку отправлять мастерам

Отправляйте только публичный URL приложения:

`https://<ваш-домен>/`

Пользователь пройдет путь:
landing -> регистрация/вход -> кабинет -> приватный функционал.
