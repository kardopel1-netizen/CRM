"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { canAccessAdmin, getSessionUser } from "@/server/auth";
import { DomainError } from "@/server/errors";
import {
  createClassifierItem,
  createUserAdmin,
  toggleClassifierItem,
  updateUserAdmin,
} from "@/server/admin";

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canAccessAdmin(user.role)) {
    throw new DomainError("Недостаточно прав");
  }
  return user;
}

export async function adminUpdateUserAction(formData: FormData) {
  const actor = await requireAdmin();
  try {
    const userId = String(formData.get("userId") || "");
    const role = String(formData.get("role") || "") as Role;
    const active = String(formData.get("active") || "") === "1";
    const departmentId = String(formData.get("departmentId") || "") || null;
    await updateUserAdmin({
      userId,
      actorId: actor.id,
      role,
      active,
      departmentId,
    });
    revalidatePath("/admin");
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}

export async function adminCreateUserAction(formData: FormData) {
  const actor = await requireAdmin();
  try {
    await createUserAdmin({
      actorId: actor.id,
      email: String(formData.get("email") || ""),
      name: String(formData.get("name") || ""),
      password: String(formData.get("password") || ""),
      role: String(formData.get("role") || "OPERATOR") as Role,
      departmentId: String(formData.get("departmentId") || "") || undefined,
    });
    revalidatePath("/admin");
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}

export async function adminCreateClassifierAction(formData: FormData) {
  const actor = await requireAdmin();
  try {
    const kind = String(formData.get("kind") || "") as "loss" | "cancel" | "channel" | "service";
    await createClassifierItem({
      kind,
      name: String(formData.get("name") || ""),
      code: String(formData.get("code") || "") || undefined,
      actorId: actor.id,
    });
    revalidatePath("/admin");
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}

export async function adminToggleClassifierAction(formData: FormData) {
  const actor = await requireAdmin();
  try {
    const kind = String(formData.get("kind") || "") as "loss" | "cancel" | "channel" | "service";
    await toggleClassifierItem({
      kind,
      id: String(formData.get("id") || ""),
      active: String(formData.get("active") || "") === "1",
      actorId: actor.id,
    });
    revalidatePath("/admin");
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}
