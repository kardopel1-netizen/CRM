# Вебхук лидов с сайта / форм

## Endpoint

`POST /api/leads`

Заголовок:

```
x-api-key: <LEAD_INGEST_API_KEY>
Content-Type: application/json
```

## Пример тела

```json
{
  "firstName": "Ольга",
  "lastName": "Иванова",
  "phone": "+7 900 111-22-33",
  "email": "olga@example.com",
  "reasonText": "Хочу записаться на гигиену",
  "channelCode": "website",
  "serviceCode": "hygiene",
  "externalId": "site-form-2026-0001",
  "sourceSystem": "Яндекс.Директ",
  "sourceCampaign": "hygiene_spring",
  "utmSource": "yandex",
  "utmMedium": "cpc",
  "utmCampaign": "hygiene_spring",
  "utmContent": "banner_1",
  "utmTerm": "чистка зубов"
}
```

## Ответ

- `201` — создано новое обращение + задача оператору
- `200` + `duplicated: true` — тот же `externalId` уже был (идемпотентность)
- `401` — неверный ключ
- `400` — ошибка валидации / неизвестный канал

## Поведение CRM

1. Ищет пациента по нормализованному телефону (без дубля карточки).
2. Создаёт обращение в воронке «Первичное обращение».
3. Назначает оператора из `LEAD_DEFAULT_ASSIGNEE_EMAIL`.
4. Ставит SLA первого контакта и задачу «Обработать новое обращение».

## Локальная проверка

```powershell
curl -Method POST http://localhost:3000/api/leads `
  -Headers @{ "x-api-key"="dev-lead-key-change-me"; "Content-Type"="application/json" } `
  -Body '{"firstName":"Тест","lastName":"Сайт","phone":"+79001234567","channelCode":"website","externalId":"demo-1","utmSource":"google"}'
```

## Каналы (`channelCode`)

`phone`, `website`, `form`, `messenger`, `social`, `ads`, `referral`, `existing`, `other`

## Направления (`serviceCode`)

`therapy`, `surgery`, `orthopedics`, `orthodontics`, `implantology`, `hygiene`, `pediatric`, `consult`
