# Aurelia CRM — стоматология

Веб-CRM клиентского пути стоматологической клиники (не замена МИС).

## Стек

- Next.js (App Router) + TypeScript + Tailwind
- Prisma + SQLite (локально; позже PostgreSQL)
- Сессии на cookie + RBAC-роли

## Быстрый старт

```bash
npm install
npx prisma migrate dev --name init
npm run db:seed
npm run dev
```

Откройте http://localhost:3000

### Демо-пользователи (пароль `demo1234`)

- `operator@clinic.local` — оператор
- `manager@clinic.local` — руководитель
- `director@clinic.local` — управляющий
- `owner@clinic.local` — собственник

## Что уже есть (MVP-база)

- Пациент + дедупликация по телефону
- Обращения, 3 воронки, этапы и переходы
- Задачи со сроками / просрочками
- Записи на приём: создание, статусы, причины отмены/неявки
- Экран «Контроль»: просрочки и эскалация задач
- Вебхук лидов `POST /api/leads` (UTM, идемпотентность)
- Уведомления пациентам: stub или HTTP-вебхук (SMS/WhatsApp-мост)
- Контракт МИС: исходящий вебхук + `POST /api/mis/events`
- Дашборд руководства и расширенные отчёты (конверсии, SLA, потери)
- Вебхук телефонии `POST /api/calls` (входящий звонок → карточка)
- Воронка возврата пациентов (план контакта + контроль)
- Админка: пользователи и классификаторы
- Слияние дублей пациентов
- Напоминания о подтверждении записи перед визитом
- Синхронизация статуса записи → этап воронки (+ SLA этапа)
- Фоновый tick `POST /api/jobs/tick` (напоминания + эскалации)
- Классификатор причин потери
- Очередь, карточка пациента, задачи, базовые отчёты
- Документы: см. `docs/`

## Дальше

Конкретный SMS-шлюз / АТС / МИС клиники (подключение URL и ключей к уже готовым контрактам).

Jobs: [docs/jobs.md](docs/jobs.md).  
Синхронизация этапов: [docs/stage-sync.md](docs/stage-sync.md).  
МИС: [docs/mis.md](docs/mis.md).  
Уведомления: [docs/notifications.md](docs/notifications.md).  
Напоминания: [docs/reminders.md](docs/reminders.md).  
Слияние дублей: [docs/merge.md](docs/merge.md).  
Админка: [docs/admin.md](docs/admin.md) (`admin@clinic.local` / `demo1234`).  
Возвраты: [docs/returns.md](docs/returns.md).  
Телефония: [docs/telephony.md](docs/telephony.md).  
Войти как `owner@clinic.local` / `demo1234` — откроется дашборд.
