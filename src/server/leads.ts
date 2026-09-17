import { z } from "zod";
import { prisma } from "@/server/db";
import { createInquiryWithTask } from "@/server/inquiries";
import { DomainError } from "@/server/errors";

export const leadIngestSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  middleName: z.string().max(100).optional(),
  phone: z.string().min(5).max(40),
  email: z.string().email().optional().or(z.literal("")),
  reasonText: z.string().max(2000).optional(),
  /** Channel code: website | form | messenger | ads | ... */
  channelCode: z.string().min(1).max(50).default("website"),
  /** Service direction code: therapy | implantology | ... */
  serviceCode: z.string().max(50).optional(),
  /** Unique id from the site form / CRM bridge — prevents duplicates */
  externalId: z.string().min(1).max(200).optional(),
  sourceSystem: z.string().max(120).optional(),
  sourceCampaign: z.string().max(200).optional(),
  sourceAd: z.string().max(200).optional(),
  utmSource: z.string().max(120).optional(),
  utmMedium: z.string().max(120).optional(),
  utmCampaign: z.string().max(200).optional(),
  utmContent: z.string().max(200).optional(),
  utmTerm: z.string().max(200).optional(),
});

export type LeadIngestInput = z.infer<typeof leadIngestSchema>;

async function resolveDefaultAssigneeId() {
  const email = process.env.LEAD_DEFAULT_ASSIGNEE_EMAIL || "operator@clinic.local";
  const user =
    (await prisma.user.findFirst({ where: { email, active: true } })) ||
    (await prisma.user.findFirst({ where: { role: "OPERATOR", active: true } }));
  if (!user) throw new DomainError("Нет активного оператора для назначения лида");
  return user.id;
}

export async function ingestLead(raw: unknown) {
  const parsed = leadIngestSchema.safeParse(raw);
  if (!parsed.success) {
    throw new DomainError(parsed.error.issues.map((i) => i.message).join("; "));
  }
  const data = parsed.data;

  const channel = await prisma.channel.findFirst({
    where: { code: data.channelCode, active: true },
  });
  if (!channel) {
    throw new DomainError(`Неизвестный канал: ${data.channelCode}`);
  }

  let serviceDirectionId: string | undefined;
  if (data.serviceCode) {
    const direction = await prisma.serviceDirection.findFirst({
      where: { code: data.serviceCode, active: true },
    });
    if (!direction) {
      throw new DomainError(`Неизвестное направление: ${data.serviceCode}`);
    }
    serviceDirectionId = direction.id;
  }

  const assigneeId = await resolveDefaultAssigneeId();

  const result = await createInquiryWithTask({
    firstName: data.firstName,
    lastName: data.lastName,
    middleName: data.middleName,
    phone: data.phone,
    email: data.email || undefined,
    channelId: channel.id,
    serviceDirectionId,
    reasonText: data.reasonText,
    assigneeId,
    createdById: null,
    externalId: data.externalId,
    utm: {
      sourceSystem: data.sourceSystem,
      sourceCampaign: data.sourceCampaign,
      sourceAd: data.sourceAd,
      utmSource: data.utmSource,
      utmMedium: data.utmMedium,
      utmCampaign: data.utmCampaign,
      utmContent: data.utmContent,
      utmTerm: data.utmTerm,
    },
  });

  return {
    inquiryId: result.inquiry.id,
    patientId: result.inquiry.patientId,
    duplicated: result.duplicated,
  };
}

export function assertLeadApiKey(headerValue: string | null) {
  const expected = process.env.LEAD_INGEST_API_KEY;
  if (!expected) {
    throw new DomainError("LEAD_INGEST_API_KEY не настроен на сервере");
  }
  if (!headerValue || headerValue !== expected) {
    const err = new DomainError("Неверный API-ключ");
    (err as DomainError & { status: number }).status = 401;
    throw err;
  }
}
