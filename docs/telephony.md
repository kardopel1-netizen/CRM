# Телефония — входящий звонок

## Endpoint

`POST /api/calls`

Заголовок:

```
x-api-key: <TELEPHONY_API_KEY или LEAD_INGEST_API_KEY>
Content-Type: application/json
```

## Пример

```json
{
  "phone": "+7 916 111-22-33",
  "direction": "inbound",
  "externalCallId": "ats-2026-00042",
  "callerName": "Ковалёва Мария",
  "note": "Звонок на рекламную линию",
  "recordingUrl": ""
}
```

`direction`: `inbound` | `outbound` | `missed`

## Поведение

1. Нормализует телефон и ищет пациента (без дубля карточки).
2. Если пациента нет — создаёт карточку-заглушку.
3. Берёт открытое обращение или создаёт новое в канале «Телефон».
4. Пишет взаимодействие типа CALL (первый контакт / этап «контакт установлен»).
5. Возвращает `patientUrl` для всплывающей карточки в софтфоне.

## Ответ

```json
{
  "ok": true,
  "patientId": "...",
  "inquiryId": "...",
  "interactionId": "...",
  "patientUrl": "/patients/...",
  "isNewPatient": false,
  "isNewInquiry": true,
  "duplicated": false
}
```

Повтор с тем же `externalCallId` → `duplicated: true`.

## Локальная проверка

```powershell
@'
{"phone":"+79001112233","direction":"inbound","externalCallId":"demo-call-1","callerName":"Тест Звонок"}
'@ | Set-Content -Encoding utf8 call-test.json
curl.exe -s -X POST http://localhost:3000/api/calls -H "x-api-key: dev-lead-key-change-me" -H "Content-Type: application/json" --data-binary "@call-test.json"
```

Софтфон открывает: `http://localhost:3000` + `patientUrl` (нужна авторизованная сессия оператора).
