# Фоновые задания (cron)

Автоматизации, которым не нужно ждать открытия страницы оператором.

## Endpoint

`POST /api/jobs/tick`

```
x-api-key: <JOBS_API_KEY или LEAD_INGEST_API_KEY>
```

## Что выполняет

1. Напоминания о подтверждении записи (`processAppointmentReminders`)
2. Эскалация просроченных задач (`escalateOverdueTasks`)

## Ответ

```json
{
  "ok": true,
  "startedAt": "...",
  "finishedAt": "...",
  "reminders": { "windowHours": 48, "candidates": 3, "notified": 1, "tasksCreated": 1, "skipped": 2 },
  "escalatedTasks": 2
}
```

## ENV

```
JOBS_API_KEY=dev-lead-key-change-me
JOBS_ACTOR_EMAIL=admin@clinic.local
```

## Планировщик (Windows)

Каждые 15 минут:

```powershell
curl.exe -s -X POST http://localhost:3000/api/jobs/tick -H "x-api-key: dev-lead-key-change-me"
```

В Task Scheduler: программа `curl.exe`, аргументы как выше, повтор каждые 15 мин.
