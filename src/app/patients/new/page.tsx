import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { createInquiryAction } from "@/app/actions";
import { getSessionUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { CreateInquiryForm } from "./CreateInquiryForm";

export default async function NewPatientPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [channels, directions] = await Promise.all([
    prisma.channel.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.serviceDirection.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  return (
    <AppShell user={user}>
      <h1 className="font-[family-name:var(--font-display)] text-3xl">Новое обращение</h1>
      <p className="mt-1 text-[var(--muted)]">
        Если пациент уже есть по телефону — обращение добавится к существующей карточке
      </p>
      <div className="mt-8 max-w-2xl rounded-xl border border-[var(--line)] bg-[var(--surface)] p-6">
        <CreateInquiryForm
          channels={channels}
          directions={directions}
          action={createInquiryAction}
        />
      </div>
    </AppShell>
  );
}
