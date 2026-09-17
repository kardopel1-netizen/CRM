import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { ALL_ROLES } from "@/lib/roles";
import { DomainError } from "@/server/errors";
import { prisma } from "@/server/db";

function slugifyCode(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40) || `item_${Date.now()}`;
}

export async function updateUserAdmin(input: {
  userId: string;
  actorId: string;
  role?: Role;
  active?: boolean;
  departmentId?: string | null;
}) {
  if (input.userId === input.actorId && input.active === false) {
    throw new DomainError("Нельзя деактивировать самого себя");
  }
  if (input.role && !ALL_ROLES.includes(input.role)) {
    throw new DomainError("Неизвестная роль");
  }

  const user = await prisma.user.update({
    where: { id: input.userId },
    data: {
      ...(input.role ? { role: input.role } : {}),
      ...(typeof input.active === "boolean" ? { active: input.active } : {}),
      ...(input.departmentId !== undefined
        ? { departmentId: input.departmentId || null }
        : {}),
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: input.actorId,
      entityType: "User",
      entityId: user.id,
      action: "admin_updated",
      payload: JSON.stringify({
        role: input.role,
        active: input.active,
        departmentId: input.departmentId,
      }),
    },
  });

  return user;
}

export async function createUserAdmin(input: {
  actorId: string;
  email: string;
  name: string;
  password: string;
  role: Role;
  departmentId?: string;
}) {
  const email = input.email.trim().toLowerCase();
  if (!email || !input.name.trim() || input.password.length < 6) {
    throw new DomainError("Заполните email, имя и пароль (мин. 6 символов)");
  }
  if (!ALL_ROLES.includes(input.role)) {
    throw new DomainError("Неизвестная роль");
  }

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) throw new DomainError("Пользователь с таким email уже есть");

  const passwordHash = await bcrypt.hash(input.password, 10);
  const user = await prisma.user.create({
    data: {
      email,
      name: input.name.trim(),
      passwordHash,
      role: input.role,
      departmentId: input.departmentId || null,
      active: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: input.actorId,
      entityType: "User",
      entityId: user.id,
      action: "admin_created",
      payload: JSON.stringify({ email, role: input.role }),
    },
  });

  return user;
}

type ClassifierKind = "loss" | "cancel" | "channel" | "service";

export async function createClassifierItem(input: {
  kind: ClassifierKind;
  name: string;
  code?: string;
  actorId: string;
}) {
  const name = input.name.trim();
  if (!name) throw new DomainError("Укажите название");
  const code = (input.code?.trim() || slugifyCode(name)).slice(0, 50);
  const sortOrder = 100;

  let created: { id: string };
  switch (input.kind) {
    case "loss":
      created = await prisma.lossReason.create({
        data: { name, code, sortOrder, active: true },
      });
      break;
    case "cancel":
      created = await prisma.cancelReason.create({
        data: { name, code, sortOrder, active: true },
      });
      break;
    case "channel":
      created = await prisma.channel.create({
        data: { name, code, sortOrder, active: true },
      });
      break;
    case "service":
      created = await prisma.serviceDirection.create({
        data: { name, code, sortOrder, active: true },
      });
      break;
  }

  await prisma.auditLog.create({
    data: {
      actorId: input.actorId,
      entityType: "Classifier",
      entityId: created.id,
      action: "created",
      payload: JSON.stringify({ kind: input.kind, name, code }),
    },
  });

  return created;
}

export async function toggleClassifierItem(input: {
  kind: ClassifierKind;
  id: string;
  active: boolean;
  actorId: string;
}) {
  let updated: { id: string };
  switch (input.kind) {
    case "loss":
      updated = await prisma.lossReason.update({
        where: { id: input.id },
        data: { active: input.active },
      });
      break;
    case "cancel":
      updated = await prisma.cancelReason.update({
        where: { id: input.id },
        data: { active: input.active },
      });
      break;
    case "channel":
      updated = await prisma.channel.update({
        where: { id: input.id },
        data: { active: input.active },
      });
      break;
    case "service":
      updated = await prisma.serviceDirection.update({
        where: { id: input.id },
        data: { active: input.active },
      });
      break;
  }

  await prisma.auditLog.create({
    data: {
      actorId: input.actorId,
      entityType: "Classifier",
      entityId: updated.id,
      action: "toggled",
      payload: JSON.stringify({ kind: input.kind, active: input.active }),
    },
  });

  return updated;
}
