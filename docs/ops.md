# Локальный SMS-мост и cron

## 1. Локальный приёмник SMS (вместо реального шлюза)

В одном терминале:

```bash
npm run sms:mock
```

В `.env`:

```
NOTIFY_PROVIDER=http
NOTIFY_WEBHOOK_URL=http://127.0.0.1:4099/sms
NOTIFY_WEBHOOK_TOKEN=dev-sms-token
NOTIFY_CHANNEL=SMS
```

Перезапустите `npm run dev`. Создайте запись — в терминале mock появится текст SMS, статус в CRM станет `SENT`.

Просмотр очереди mock: http://127.0.0.1:4099/

## 2. Фоновый tick

Разовый запуск:

```powershell
npm run jobs:tick
# или
.\scripts\tick.ps1
```

Регистрация в Task Scheduler (каждые 15 мин):

```powershell
.\scripts\register-tick-task.ps1
```

Ключ: `JOBS_API_KEY` (или `LEAD_INGEST_API_KEY`). Подробнее: [jobs.md](jobs.md).
