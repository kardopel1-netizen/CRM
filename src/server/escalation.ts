import { Role, TaskStatus } from "@prisma/client";
import { prisma } from "@/server/db";

/** Mark overdue open tasks as escalated (idempotent). */
export async function escalateOverdueTasks() {
  const now = new Date();
  const result = await prisma.task.updateMany({
    where: {
      status: TaskStatus.OPEN,
      dueAt: { lt: now },
      escalatedAt: null,
    },
    data: { escalatedAt: now },
  });
  return result.count;
}

export async function listControlBoard(opts: {
  role: Role;
  userId: string;
  departmentId: string | null;
}) {
  await escalateOverdueTasks();

  const canSeeAll =
    opts.role === Role.MANAGER ||
    opts.role === Role.DIRECTOR ||
    opts.role === Role.OWNER ||
    opts.role === Role.ADMIN;

  const assigneeFilter =
    canSeeAll && opts.role === Role.MANAGER && opts.departmentId
      ? { assignee: { departmentId: opts.departmentId } }
      : canSeeAll
        ? {}
        : { assigneeId: opts.userId };

  const now = new Date();

  const [overdueTasks, overdueInquiries, escalatedTasks] = await Promise.all([
    prisma.task.findMany({
      where: {
        status: TaskStatus.OPEN,
        dueAt: { lt: now },
        ...assigneeFilter,
      },
      include: {
        assignee: true,
        inquiry: { include: { patient: true } },
      },
      orderBy: { dueAt: "asc" },
      take: 100,
    }),
    prisma.inquiry.findMany({
      where: {
        status: "OPEN",
        nextActionAt: { lt: now },
        ...(canSeeAll && opts.role === Role.MANAGER && opts.departmentId
          ? { assignee: { departmentId: opts.departmentId } }
          : canSeeAll
            ? {}
            : { assigneeId: opts.userId }),
      },
      include: {
        patient: true,
        stage: true,
        assignee: true,
      },
      orderBy: { nextActionAt: "asc" },
      take: 100,
    }),
    prisma.task.count({
      where: {
        status: TaskStatus.OPEN,
        escalatedAt: { not: null },
        ...assigneeFilter,
      },
    }),
  ]);

  return { overdueTasks, overdueInquiries, escalatedTasks };
}
