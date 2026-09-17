import { Role } from "@prisma/client";

export const ALL_ROLES: Role[] = [
  Role.OPERATOR,
  Role.MANAGER,
  Role.DIRECTOR,
  Role.OWNER,
  Role.ADMIN,
];

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

export function canSeeAllInquiries(role: Role): boolean {
  return (
    role === Role.MANAGER ||
    role === Role.DIRECTOR ||
    role === Role.OWNER ||
    role === Role.ADMIN
  );
}

export function canAccessAdmin(role: Role): boolean {
  return role === Role.ADMIN || role === Role.DIRECTOR || role === Role.OWNER;
}

export function canSeeManagementDashboard(role: Role): boolean {
  return (
    role === Role.MANAGER ||
    role === Role.DIRECTOR ||
    role === Role.OWNER ||
    role === Role.ADMIN
  );
}
