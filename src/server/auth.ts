import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { Role } from "@prisma/client";
import { prisma } from "@/server/db";

const COOKIE = "clinic_session";
const MAX_AGE_SEC = 60 * 60 * 24 * 7;

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  departmentId: string | null;
};

function secret() {
  return process.env.SESSION_SECRET || "dev-change-me-to-a-long-random-string";
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function encodeSession(user: SessionUser): string {
  const body = Buffer.from(JSON.stringify(user), "utf8").toString("base64url");
  return `${body}.${sign(body)}`;
}

function decodeSession(token: string): SessionUser | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = sign(body);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionUser;
  } catch {
    return null;
  }
}

export async function setSession(user: SessionUser) {
  const jar = await cookies();
  jar.set(COOKIE, encodeSession(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SEC,
  });
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (!raw) return null;
  const session = decodeSession(raw);
  if (!session?.id) return null;
  const user = await prisma.user.findFirst({
    where: { id: session.id, active: true },
    select: { id: true, email: true, name: true, role: true, departmentId: true },
  });
  return user;
}

export function canSeeAllInquiries(role: Role): boolean {
  return role === Role.MANAGER || role === Role.DIRECTOR || role === Role.OWNER || role === Role.ADMIN;
}

export function roleLabel(role: Role): string {
  switch (role) {
    case Role.OPERATOR:
      return "Оператор";
    case Role.MANAGER:
      return "Руководитель";
    case Role.DIRECTOR:
      return "Управляющий";
    case Role.OWNER:
      return "Собственник";
    case Role.ADMIN:
      return "Админ";
  }
}
