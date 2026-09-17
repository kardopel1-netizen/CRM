# Интеграция с МИС (контракт)

CRM **не заменяет** МИС. Обмен идёт через вебхуки: CRM → МИС (исходящие) и МИС → CRM (входящие).

## Исходящие (CRM → МИС)

Если задан `MIS_WEBHOOK_URL`, при создании записи и смене статуса CRM делает `POST` на этот URL.

### События

| event | Когда |
|---|---|
| `appointment.created` | Создана запись |
| `appointment.status_changed` | Изменён статус записи |

### Payload

```json
{
  "event": "appointment.status_changed",
  "source": "aurelia-crm",
  "at": "2026-09-17T12:00:00.000Z",
  "appointment": {
    "id": "crm_appointment_id",
    "status": "CONFIRMED",
    "startsAt": "2026-09-18T09:00:00.000Z",
    "doctorName": "Иванова",
    "serviceName": "Гигиена",
    "comment": null,
    "cancelReasonCode": null,
    "inquiryId": "...",
    "fromStatus": "BOOKED",
    "toStatus": "CONFIRMED"
  },
  "patient": {
    "id": "...",
    "phone": "+79001112233",
    "phoneNormalized": "79001112233",
    "firstName": "Мария",
    "lastName": "Ковалёва",
    "middleName": null
  }
}
```

Ошибки исходящей синхронизации пишутся в `AuditLog` (`MisSync`) и **не блокируют** работу CRM.

## Входящие (МИС → CRM)

`POST /api/mis/events`

Заголовок:

```
x-api-key: <MIS_API_KEY или LEAD_INGEST_API_KEY>
Content-Type: application/json
```

### Пример

```json
{
  "event": "appointment.arrived",
  "appointmentId": "crm_appointment_id",
  "comment": "Пациент отмечен в МИС",
  "externalEventId": "mis-evt-10042"
}
```

`event`:

- `appointment.arrived`
- `appointment.confirmed`
- `appointment.cancelled`
- `appointment.no_show`

Поиск записи: `appointmentId` **или** `phone` (+ опционально `startsAt` ISO, окно ±30 мин).

Повтор с тем же `externalEventId` → `duplicated: true`.

Входящие события не вызывают обратный push в МИС (нет петли).

## ENV

```
MIS_WEBHOOK_URL=
MIS_WEBHOOK_TOKEN=
MIS_API_KEY=dev-lead-key-change-me
MIS_DEFAULT_ACTOR_EMAIL=admin@clinic.local
```

## Локальная проверка входящего события

```powershell
@'
{"event":"appointment.confirmed","appointmentId":"<id из UI>","externalEventId":"demo-mis-1"}
'@ | Set-Content -Encoding utf8 mis-test.json
curl.exe -s -X POST http://localhost:3000/api/mis/events -H "x-api-key: dev-lead-key-change-me" -H "Content-Type: application/json" --data-binary "@mis-test.json"
```
