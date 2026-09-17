import { DomainError } from "@/server/errors";
import { prisma } from "@/server/db";
import { normalizePhone } from "@/lib/phone";

/**
 * Merge absorb patient into keep patient.
 * Moves inquiries, appointments, interactions, notifications; deletes absorb card.
 */
export async function mergePatients(input: {
  keepId: string;
  absorbId: string;
  actorId: string;
  preferPhoneFrom?: "keep" | "absorb";
  preferEmailFrom?: "keep" | "absorb";
}) {
  if (input.keepId === input.absorbId) {
    throw new DomainError("Выберите двух разных пациентов");
  }

  const [keep, absorb] = await Promise.all([
    prisma.patient.findUnique({ where: { id: input.keepId } }),
    prisma.patient.findUnique({ where: { id: input.absorbId } }),
  ]);
  if (!keep || !absorb) throw new DomainError("Пациент не найден");

  // If phones differ and absorb phone already on another card — block
  if (absorb.phoneNormalized !== keep.phoneNormalized) {
    const clash = await prisma.patient.findFirst({
      where: {
        phoneNormalized: absorb.phoneNormalized,
        id: { notIn: [keep.id, absorb.id] },
      },
    });
    if (clash) {
      throw new DomainError(
        "Телефон поглощаемой карточки уже есть у другого пациента — сначала исправьте номера",
      );
    }
  }

  return prisma.$transaction(async (tx) => {
    await tx.inquiry.updateMany({
      where: { patientId: absorb.id },
      data: { patientId: keep.id },
    });
    await tx.appointment.updateMany({
      where: { patientId: absorb.id },
      data: { patientId: keep.id },
    });
    await tx.interaction.updateMany({
      where: { patientId: absorb.id },
      data: { patientId: keep.id },
    });
    await tx.notification.updateMany({
      where: { patientId: absorb.id },
      data: { patientId: keep.id },
    });

    const preferPhone = input.preferPhoneFrom ?? "keep";
    const preferEmail = input.preferEmailFrom ?? "keep";

    const phone =
      preferPhone === "absorb" ? absorb.phone : keep.phone || absorb.phone;
    const phoneNormalized =
      preferPhone === "absorb"
        ? absorb.phoneNormalized
        : keep.phoneNormalized || absorb.phoneNormalized;
    const email =
      preferEmail === "absorb"
        ? absorb.email || keep.email
        : keep.email || absorb.email;

    const notes = [keep.notes, absorb.notes, `Слито с карточкой ${absorb.id}`]
      .filter(Boolean)
      .join("\n");

    const updated = await tx.patient.update({
      where: { id: keep.id },
      data: {
        phone,
        phoneNormalized,
        email,
        notes,
        // Fill empty name parts from absorb
        firstName: keep.firstName || absorb.firstName,
        lastName: keep.lastName || absorb.lastName,
        middleName: keep.middleName || absorb.middleName,
      },
    });

    await tx.patient.delete({ where: { id: absorb.id } });

    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        entityType: "Patient",
        entityId: keep.id,
        action: "merged",
        payload: JSON.stringify({
          absorbedId: absorb.id,
          absorbedName: `${absorb.lastName} ${absorb.firstName}`,
          absorbedPhone: absorb.phone,
        }),
      },
    });

    return updated;
  });
}

export async function findPossibleDuplicateGroups(limit = 20) {
  const patients = await prisma.patient.findMany({
    select: {
      id: true,
      firstName: true,
      lastName: true,
      middleName: true,
      phone: true,
      phoneNormalized: true,
      email: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 500,
  });

  const byPhone = new Map<string, typeof patients>();
  const byName = new Map<string, typeof patients>();

  for (const p of patients) {
    const phoneKey = p.phoneNormalized;
    if (phoneKey) {
      const list = byPhone.get(phoneKey) ?? [];
      list.push(p);
      byPhone.set(phoneKey, list);
    }
    const nameKey = `${p.lastName.trim().toLowerCase()}|${p.firstName.trim().toLowerCase()}`;
    const list = byName.get(nameKey) ?? [];
    list.push(p);
    byName.set(nameKey, list);
  }

  const groups: {
    key: string;
    reason: string;
    patients: typeof patients;
  }[] = [];

  for (const [key, list] of byPhone) {
    if (list.length > 1) {
      groups.push({ key: `phone:${key}`, reason: "Одинаковый телефон", patients: list });
    }
  }
  for (const [key, list] of byName) {
    if (list.length > 1) {
      // skip if already covered as same phone group entirely
      const ids = new Set(list.map((p) => p.id));
      const already = groups.some(
        (g) =>
          g.patients.length === list.length &&
          g.patients.every((p) => ids.has(p.id)),
      );
      if (!already) {
        groups.push({
          key: `name:${key}`,
          reason: "Одинаковые Фамилия + Имя",
          patients: list,
        });
      }
    }
  }

  return groups.slice(0, limit);
}

export async function searchPatientsForMerge(query: string) {
  const q = query.trim();
  if (!q) return [];
  const phone = normalizePhone(q);
  return prisma.patient.findMany({
    where: {
      OR: [
        { lastName: { contains: q } },
        { firstName: { contains: q } },
        { phone: { contains: q } },
        ...(phone ? [{ phoneNormalized: { contains: phone } }] : []),
        { email: { contains: q } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: 30,
  });
}
