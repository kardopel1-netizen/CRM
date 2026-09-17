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
- Запись (в демо-данных)
- Классификатор причин потери
- Очередь, карточка пациента, задачи, базовые отчёты
- Документы процессов: `docs/process.md`, `docs/classifiers.md`

## Дальше

Автоматизации и эскалации, полноценный UI записей, вебхук сайта, интеграции телефонии/МИС.
