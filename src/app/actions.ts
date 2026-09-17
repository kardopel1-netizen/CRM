"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { clearSession, getSessionUser, setSession } from "@/server/auth";
import { createInquiryWithTask, moveInquiryStage } from "@/server/inquiries";
import { DomainError } from "@/server/errors";
import { createAppointment, updateAppointmentStatus } from "@/server/appointments";
import { logPatientInteraction } from "@/server/interactions";
import { schedulePatientReturn, type ReturnReasonCode } from "@/server/returns";
import { canSeeManagementDashboard } from "@/lib/roles";
import { AppointmentStatus, InteractionType, TaskStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active) {
    return { error: "Неверный email или пароль" };
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return { error: "Неверный email или пароль" };
  }
  await setSession({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    departmentId: user.departmentId,
  });
  redirect(canSeeManagementDashboard(user.role) ? "/dashboard" : "/queue");
}

export async function logoutAction() {
  await clearSession();
  redirect("/login");
}

export async function createInquiryAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  try {
    const inquiry = await createInquiryWithTask({
      firstName: String(formData.get("firstName") || ""),
      lastName: String(formData.get("lastName") || ""),
      middleName: String(formData.get("middleName") || "") || undefined,
      phone: String(formData.get("phone") || ""),
      email: String(formData.get("email") || "") || undefined,
      channelId: String(formData.get("channelId") || "") || undefined,
      serviceDirectionId: String(formData.get("serviceDirectionId") || "") || undefined,
      reasonText: String(formData.get("reasonText") || "") || undefined,
      assigneeId: user.id,
      createdById: user.id,
      utm: {
        utmSource: String(formData.get("utmSource") || "") || undefined,
        utmCampaign: String(formData.get("utmCampaign") || "") || undefined,
        sourceSystem: String(formData.get("sourceSystem") || "") || undefined,
      },
    });
    revalidatePath("/queue");
    redirect(`/patients/${inquiry.inquiry.patientId}`);
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}

export async function changeStageAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const inquiryId = String(formData.get("inquiryId") || "");
  const toStageId = String(formData.get("toStageId") || "");
  const lossReasonId = String(formData.get("lossReasonId") || "") || undefined;
  const nextActionText = String(formData.get("nextActionText") || "") || undefined;
  const nextActionAtRaw = String(formData.get("nextActionAt") || "");
  const nextActionAt = nextActionAtRaw ? new Date(nextActionAtRaw) : undefined;
  const patientId = String(formData.get("patientId") || "");

  try {
    await moveInquiryStage({
      inquiryId,
      toStageId,
      actorId: user.id,
      lossReasonId,
      nextActionAt,
      nextActionText,
      comment: String(formData.get("comment") || "") || undefined,
    });
    revalidatePath(`/patients/${patientId}`);
    revalidatePath("/queue");
    revalidatePath("/tasks");
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}

export async function completeTaskAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const taskId = String(formData.get("taskId") || "");
  await prisma.task.update({
    where: { id: taskId },
    data: { status: TaskStatus.DONE, completedAt: new Date() },
  });
  revalidatePath("/tasks");
  revalidatePath("/queue");
  revalidatePath("/control");
}

export async function createAppointmentAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const patientId = String(formData.get("patientId") || "");
  const inquiryId = String(formData.get("inquiryId") || "") || undefined;
  const startsAtRaw = String(formData.get("startsAt") || "");
  const startsAt = startsAtRaw ? new Date(startsAtRaw) : undefined;

  try {
    await createAppointment({
      patientId,
      inquiryId,
      startsAt,
      doctorName: String(formData.get("doctorName") || "") || undefined,
      serviceName: String(formData.get("serviceName") || "") || undefined,
      actorId: user.id,
    });
    revalidatePath(`/patients/${patientId}`);
    revalidatePath("/appointments");
    revalidatePath("/tasks");
    revalidatePath("/queue");
    revalidatePath("/notifications");
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}

export async function updateAppointmentStatusAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const appointmentId = String(formData.get("appointmentId") || "");
  const patientId = String(formData.get("patientId") || "");
  const status = String(formData.get("status") || "") as AppointmentStatus;
  const cancelReasonId = String(formData.get("cancelReasonId") || "") || undefined;
  const comment = String(formData.get("comment") || "") || undefined;

  try {
    await updateAppointmentStatus({
      appointmentId,
      status,
      cancelReasonId,
      comment,
      actorId: user.id,
    });
    revalidatePath(`/patients/${patientId}`);
    revalidatePath("/appointments");
    revalidatePath("/tasks");
    revalidatePath("/queue");
    revalidatePath("/control");
    revalidatePath("/notifications");
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}

export async function logInteractionAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const patientId = String(formData.get("patientId") || "");
  const inquiryId = String(formData.get("inquiryId") || "") || undefined;
  const type = String(formData.get("type") || "COMMENT") as InteractionType;
  const body = String(formData.get("body") || "");
  const countsRaw = formData.get("countsAsContactAttempt");
  const countsAsContactAttempt = countsRaw === "1" || countsRaw === "on";

  try {
    await logPatientInteraction({
      patientId,
      inquiryId,
      authorId: user.id,
      type,
      body,
      countsAsContactAttempt,
    });
    revalidatePath(`/patients/${patientId}`);
    revalidatePath("/queue");
    revalidatePath("/control");
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}

export async function scheduleReturnAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const patientId = String(formData.get("patientId") || "");
  const fromInquiryId = String(formData.get("fromInquiryId") || "") || undefined;
  const reasonCode = String(formData.get("reasonCode") || "continue_treatment") as ReturnReasonCode;
  const dueAtRaw = String(formData.get("dueAt") || "");
  const comment = String(formData.get("comment") || "") || undefined;

  try {
    await schedulePatientReturn({
      patientId,
      actorId: user.id,
      dueAt: new Date(dueAtRaw),
      reasonCode,
      comment,
      fromInquiryId,
    });
    revalidatePath(`/patients/${patientId}`);
    revalidatePath("/queue");
    revalidatePath("/tasks");
    revalidatePath("/control");
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}
