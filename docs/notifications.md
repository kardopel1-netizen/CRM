# Уведомления пациентам

## Как работает

При событиях записи CRM создаёт запись в таблице `Notification` и отправляет через провайдер:

| `NOTIFY_PROVIDER` | Поведение |
|---|---|
| `stub` (по умолчанию) | Помечает `SENT`, пишет в историю контактов. Без реальной SMS. |
| `http` (или `webhook`) | `POST` на `NOTIFY_WEBHOOK_URL` — мост к SMS/WhatsApp (n8n, Make, SMSC, Twilio и т.п.). |

## Триггеры

| Событие | Kind |
|---|---|
| Создана запись | `APPOINTMENT_BOOKED` |
| Статус → Подтверждён | `APPOINTMENT_CONFIRMED` |
| Статус → Записан (повторно) / напоминание | `APPOINTMENT_CONFIRM_REQUEST` |
| Отмена пациентом | `APPOINTMENT_CANCELLED` |
| Перенос клиникой | `APPOINTMENT_RESCHEDULED` |
| Неявка | `APPOINTMENT_NO_SHOW` |

## ENV

```
NOTIFY_PROVIDER=stub
CLINIC_NAME=Aurelia Стоматология

# Для HTTP-провайдера:
NOTIFY_PROVIDER=http
NOTIFY_WEBHOOK_URL=https://hooks.example.com/sms
NOTIFY_WEBHOOK_TOKEN=secret
NOTIFY_CHANNEL=SMS
```

`NOTIFY_CHANNEL`: `SMS` | `WHATSAPP` | `EMAIL` (пишется в запись уведомления).

## Payload HTTP

```json
{
  "id": "notification_cuid",
  "to": "+79001112233",
  "phone": "+79001112233",
  "body": "Мария, вы записаны...",
  "kind": "APPOINTMENT_BOOKED",
  "channel": "SMS",
  "clinic": "Aurelia Стоматология",
  "patientId": "...",
  "appointmentId": "...",
  "inquiryId": "..."
}
```

Ожидается ответ **2xx**. Опционально JSON с `providerRef` / `messageId` / `id` — сохранится как ссылка провайдера.

Заголовки: `Authorization: Bearer <token>` и `x-api-key: <token>` (если задан токен).

## UI

Раздел **Уведомления** — очередь и статусы последних сообщений.
