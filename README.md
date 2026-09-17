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
- Классификатор причин потери
- Очередь, карточка пациента, задачи, базовые отчёты
- Документы: `docs/process.md`, `docs/classifiers.md`, `docs/webhook.md`

## Дальше

Уведомления пациенту (SMS/мессенджер), интеграции телефонии/МИС.

Вебхук лидов: см. [docs/webhook.md](docs/webhook.md) — `POST /api/leads`.
