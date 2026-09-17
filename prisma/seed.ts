import { PrismaClient, Role, AppointmentStatus, InquiryStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  await prisma.auditLog.deleteMany();
  await prisma.task.deleteMany();
  await prisma.interaction.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.inquiry.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.stageTransition.deleteMany();
  await prisma.funnelStage.deleteMany();
  await prisma.funnel.deleteMany();
  await prisma.channel.deleteMany();
  await prisma.serviceDirection.deleteMany();
  await prisma.lossReason.deleteMany();
  await prisma.cancelReason.deleteMany();
  await prisma.user.deleteMany();
  await prisma.department.deleteMany();

  const reception = await prisma.department.create({
    data: { name: "Администраторы / ресепшен" },
  });
  const callCenter = await prisma.department.create({
    data: { name: "Колл-центр" },
  });

  const passwordHash = await bcrypt.hash("demo1234", 10);

  const users = await Promise.all([
    prisma.user.create({
      data: {
        email: "admin@clinic.local",
        name: "Системный админ",
        passwordHash,
        role: Role.ADMIN,
      },
    }),
    prisma.user.create({
      data: {
        email: "operator@clinic.local",
        name: "Анна Администратор",
        passwordHash,
        role: Role.OPERATOR,
        departmentId: reception.id,
      },
    }),
    prisma.user.create({
      data: {
        email: "call@clinic.local",
        name: "Ирина Колл-центр",
        passwordHash,
        role: Role.OPERATOR,
        departmentId: callCenter.id,
      },
    }),
    prisma.user.create({
      data: {
        email: "manager@clinic.local",
        name: "Сергей Руководитель",
        passwordHash,
        role: Role.MANAGER,
        departmentId: reception.id,
      },
    }),
    prisma.user.create({
      data: {
        email: "director@clinic.local",
        name: "Елена Управляющая",
        passwordHash,
        role: Role.DIRECTOR,
      },
    }),
    prisma.user.create({
      data: {
        email: "owner@clinic.local",
        name: "Владелец клиники",
        passwordHash,
        role: Role.OWNER,
      },
    }),
  ]);

  const operator = users[1];

  const channels = [
    { code: "phone", name: "Телефон", sortOrder: 1 },
    { code: "website", name: "Сайт", sortOrder: 2 },
    { code: "form", name: "Форма обратной связи", sortOrder: 3 },
    { code: "messenger", name: "Мессенджер", sortOrder: 4 },
    { code: "social", name: "Социальные сети", sortOrder: 5 },
    { code: "ads", name: "Реклама", sortOrder: 6 },
    { code: "referral", name: "Рекомендация", sortOrder: 7 },
    { code: "existing", name: "Существующий пациент", sortOrder: 8 },
    { code: "other", name: "Другое", sortOrder: 9 },
  ];
  for (const c of channels) {
    await prisma.channel.create({ data: c });
  }

  const directions = [
    { code: "therapy", name: "Терапия", sortOrder: 1 },
    { code: "surgery", name: "Хирургия", sortOrder: 2 },
    { code: "orthopedics", name: "Ортопедия", sortOrder: 3 },
    { code: "orthodontics", name: "Ортодонтия", sortOrder: 4 },
    { code: "implantology", name: "Имплантация", sortOrder: 5 },
    { code: "hygiene", name: "Гигиена / профилактика", sortOrder: 6 },
    { code: "pediatric", name: "Детская стоматология", sortOrder: 7 },
    { code: "consult", name: "Консультация", sortOrder: 8 },
  ];
  for (const d of directions) {
    await prisma.serviceDirection.create({ data: d });
  }

  const lossReasons = [
    { code: "price", name: "Высокая стоимость", sortOrder: 1 },
    { code: "other_clinic", name: "Выбрал другую клинику", sortOrder: 2 },
    { code: "inconvenient_time", name: "Неудобное время", sortOrder: 3 },
    { code: "location", name: "Неудобное расположение", sortOrder: 4 },
    { code: "no_contact", name: "Не удалось связаться", sortOrder: 5 },
    { code: "postpone", name: "Решил отложить лечение", sortOrder: 6 },
    { code: "no_need", name: "Консультация больше не нужна", sortOrder: 7 },
    { code: "contraindication", name: "Медицинские противопоказания", sortOrder: 8 },
    { code: "other", name: "Другое", sortOrder: 9 },
  ];
  for (const r of lossReasons) {
    await prisma.lossReason.create({ data: r });
  }

  const cancelReasons = [
    { code: "patient_busy", name: "Пациент занят", sortOrder: 1 },
    { code: "felt_better", name: "Самочувствие улучшилось", sortOrder: 2 },
    { code: "price", name: "Стоимость", sortOrder: 3 },
    { code: "fear", name: "Страх / тревога", sortOrder: 4 },
    { code: "clinic_slot", name: "Перенос клиникой", sortOrder: 5 },
    { code: "doctor_unavailable", name: "Врач недоступен", sortOrder: 6 },
    { code: "other", name: "Другое", sortOrder: 7 },
  ];
  for (const r of cancelReasons) {
    await prisma.cancelReason.create({ data: r });
  }

  const primary = await prisma.funnel.create({
    data: {
      code: "primary",
      name: "Первичное обращение",
      description: "От первого контакта до визита",
      sortOrder: 1,
      stages: {
        create: [
          { code: "new", name: "Новое обращение", sortOrder: 1, slaMinutes: 15 },
          { code: "contacted", name: "Контакт установлен", sortOrder: 2, slaMinutes: 60 },
          { code: "need_defined", name: "Потребность определена", sortOrder: 3, slaMinutes: 120 },
          { code: "offer_made", name: "Предложена запись", sortOrder: 4, slaMinutes: 240 },
          { code: "booked", name: "Записан", sortOrder: 5, slaMinutes: 1440 },
          { code: "confirmed", name: "Подтверждён", sortOrder: 6, slaMinutes: 1440 },
          { code: "arrived", name: "Пришёл", sortOrder: 7, isTerminal: true },
          { code: "no_show", name: "Не пришёл", sortOrder: 8, isTerminal: false, slaMinutes: 120 },
          { code: "lost", name: "Потерян / отказ", sortOrder: 9, isTerminal: true, requiresReason: true },
        ],
      },
    },
    include: { stages: true },
  });

  const aftercare = await prisma.funnel.create({
    data: {
      code: "aftercare",
      name: "После первичного приёма",
      description: "План лечения и продолжение",
      sortOrder: 2,
      stages: {
        create: [
          { code: "first_visit_done", name: "Первичный приём", sortOrder: 1, slaMinutes: 1440 },
          { code: "plan_ready", name: "Составлен план лечения", sortOrder: 2, slaMinutes: 2880 },
          { code: "needs_continue", name: "Требуется продолжение", sortOrder: 3, slaMinutes: 2880 },
          { code: "booked_next", name: "Записан на следующий этап", sortOrder: 4, slaMinutes: 1440 },
          { code: "treatment_started", name: "Лечение начато", sortOrder: 5, isTerminal: true },
          { code: "deferred", name: "Отложил решение", sortOrder: 6, slaMinutes: 10080 },
          { code: "lost", name: "Пациент потерян", sortOrder: 7, isTerminal: true, requiresReason: true },
        ],
      },
    },
    include: { stages: true },
  });

  const returnFunnel = await prisma.funnel.create({
    data: {
      code: "return",
      name: "Возврат пациентов",
      description: "Контроль, профилактика, отложенные решения",
      sortOrder: 3,
      stages: {
        create: [
          { code: "due", name: "Требуется контакт", sortOrder: 1, slaMinutes: 1440 },
          { code: "contacted", name: "Связались", sortOrder: 2, slaMinutes: 2880 },
          { code: "booked", name: "Записан", sortOrder: 3, slaMinutes: 1440 },
          { code: "arrived", name: "Пришёл", sortOrder: 4, isTerminal: true },
          { code: "refused", name: "Отказ", sortOrder: 5, isTerminal: true, requiresReason: true },
        ],
      },
    },
    include: { stages: true },
  });

  async function linkLinear(stages: { id: string; sortOrder: number }[]) {
    const ordered = [...stages].sort((a, b) => a.sortOrder - b.sortOrder);
    for (let i = 0; i < ordered.length - 1; i++) {
      await prisma.stageTransition.create({
        data: { fromStageId: ordered[i].id, toStageId: ordered[i + 1].id },
      });
    }
    // allow jump to last terminal/lost from earlier stages
    const lost = ordered.find((s) => s === ordered[ordered.length - 1]);
    if (lost) {
      for (const stage of ordered.slice(0, -1)) {
        await prisma.stageTransition.upsert({
          where: {
            fromStageId_toStageId: { fromStageId: stage.id, toStageId: lost.id },
          },
          create: { fromStageId: stage.id, toStageId: lost.id },
          update: {},
        });
      }
    }
  }

  await linkLinear(primary.stages);
  await linkLinear(aftercare.stages);
  await linkLinear(returnFunnel.stages);

  const phone = await prisma.channel.findUniqueOrThrow({ where: { code: "phone" } });
  const website = await prisma.channel.findUniqueOrThrow({ where: { code: "website" } });
  const therapy = await prisma.serviceDirection.findUniqueOrThrow({ where: { code: "therapy" } });
  const implant = await prisma.serviceDirection.findUniqueOrThrow({
    where: { code: "implantology" },
  });
  const newStage = primary.stages.find((s) => s.code === "new")!;
  const bookedStage = primary.stages.find((s) => s.code === "booked")!;

  const patient1 = await prisma.patient.create({
    data: {
      firstName: "Мария",
      lastName: "Ковалёва",
      phone: "+7 (916) 111-22-33",
      phoneNormalized: "79161112233",
      email: "maria@example.com",
    },
  });
  const patient2 = await prisma.patient.create({
    data: {
      firstName: "Алексей",
      lastName: "Смирнов",
      phone: "+7 (903) 444-55-66",
      phoneNormalized: "79034445566",
    },
  });

  const dueSoon = new Date(Date.now() + 20 * 60 * 1000);
  const overdue = new Date(Date.now() - 40 * 60 * 1000);

  const inquiry1 = await prisma.inquiry.create({
    data: {
      patientId: patient1.id,
      funnelId: primary.id,
      stageId: newStage.id,
      channelId: website.id,
      serviceDirectionId: implant.id,
      assigneeId: operator.id,
      createdById: operator.id,
      status: InquiryStatus.OPEN,
      reasonText: "Интересует имплантация",
      utmSource: "yandex",
      utmMedium: "cpc",
      utmCampaign: "implants_spring",
      sourceSystem: "Яндекс.Директ",
      sourceCampaign: "implants_spring",
      firstContactDueAt: overdue,
      nextActionAt: overdue,
      nextActionText: "Позвонить и уточнить потребность",
    },
  });

  const inquiry2 = await prisma.inquiry.create({
    data: {
      patientId: patient2.id,
      funnelId: primary.id,
      stageId: bookedStage.id,
      channelId: phone.id,
      serviceDirectionId: therapy.id,
      assigneeId: operator.id,
      createdById: operator.id,
      status: InquiryStatus.OPEN,
      reasonText: "Боль в зубе",
      firstContactAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      firstContactDueAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      nextActionAt: dueSoon,
      nextActionText: "Подтвердить запись за день до визита",
    },
  });

  await prisma.appointment.create({
    data: {
      patientId: patient2.id,
      inquiryId: inquiry2.id,
      status: AppointmentStatus.BOOKED,
      startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      doctorName: "д-р Петрова",
      serviceName: "Терапевтический приём",
    },
  });

  await prisma.task.create({
    data: {
      title: "Обработать новое обращение",
      description: "Связаться с пациентом по имплантации",
      dueAt: overdue,
      inquiryId: inquiry1.id,
      assigneeId: operator.id,
      createdById: operator.id,
    },
  });

  await prisma.task.create({
    data: {
      title: "Подтвердить запись",
      dueAt: dueSoon,
      inquiryId: inquiry2.id,
      assigneeId: operator.id,
      createdById: operator.id,
    },
  });

  await prisma.interaction.create({
    data: {
      patientId: patient2.id,
      inquiryId: inquiry2.id,
      authorId: operator.id,
      type: "CALL",
      body: "Договорились о записи на завтра, 10:00.",
    },
  });

  console.log("Seed OK. Demo logins (password: demo1234):");
  console.log("  operator@clinic.local / manager@clinic.local / director@clinic.local / owner@clinic.local");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
