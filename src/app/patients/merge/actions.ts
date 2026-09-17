"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/server/auth";
import { DomainError } from "@/server/errors";
import { mergePatients } from "@/server/merge";
import { canAccessAdmin } from "@/lib/roles";

export async function mergePatientsAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  // Operators can merge too — common front-desk task; managers always can
  if (!canAccessAdmin(user.role) && user.role !== "OPERATOR" && user.role !== "MANAGER") {
    return { error: "Недостаточно прав" };
  }

  const keepId = String(formData.get("keepId") || "");
  const absorbId = String(formData.get("absorbId") || "");
  const preferPhoneFrom = String(formData.get("preferPhoneFrom") || "keep") as
    | "keep"
    | "absorb";
  const preferEmailFrom = String(formData.get("preferEmailFrom") || "keep") as
    | "keep"
    | "absorb";

  try {
    const merged = await mergePatients({
      keepId,
      absorbId,
      actorId: user.id,
      preferPhoneFrom,
      preferEmailFrom,
    });
    revalidatePath("/patients");
    revalidatePath("/patients/merge");
    revalidatePath(`/patients/${merged.id}`);
    redirect(`/patients/${merged.id}`);
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}
