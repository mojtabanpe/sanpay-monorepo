import type { AdminProfile } from './admin.model';

/** Shared by the API guard, dashboard routes and permissions editor. */
export const ADMIN_PERMISSION_GROUPS = [
  { resource: 'overview', label: 'نمای کلی', writable: false },
  { resource: 'companies', label: 'شرکت‌ها', writable: true },
  { resource: 'employees', label: 'کارمندان', writable: true },
  { resource: 'wallets', label: 'کیف‌پول‌ها و تخصیص اعتبار', writable: true },
  { resource: 'stores', label: 'فروشگاه‌ها', writable: true },
  { resource: 'payments', label: 'گزارش پرداخت‌ها', writable: false },
  { resource: 'gateway-payments', label: 'پرداخت‌های درگاه', writable: false },
  { resource: 'upg-review', label: 'بررسی دستی درگاه', writable: true },
  { resource: 'gateways', label: 'وضعیت درگاه‌ها', writable: false },
  { resource: 'settlements', label: 'تسویه‌ها', writable: true },
  { resource: 'bookings', label: 'رزرو هتل', writable: false },
  { resource: 'flight-bookings', label: 'رزرو پرواز', writable: false },
  { resource: 'tourism-split', label: 'تفکیک پرداخت گردشگری', writable: false },
] as const;

export type AdminResource =
  (typeof ADMIN_PERMISSION_GROUPS)[number]['resource'];
export type AdminPermission = `${AdminResource}:${'read' | 'write'}`;
export const ADMIN_PERMISSIONS: AdminPermission[] =
  ADMIN_PERMISSION_GROUPS.flatMap(({ resource, writable }) => [
    `${resource}:read` as AdminPermission,
    ...(writable ? [`${resource}:write` as AdminPermission] : []),
  ]);

export function hasAdminPermission(
  profile: Pick<AdminProfile, 'role' | 'permissions'> | null,
  permission: AdminPermission,
): boolean {
  if (!profile) return false;
  if (profile.role === 'SUPER_ADMIN') return true;
  if (profile.role === 'VIEWER') return permission.endsWith(':read');
  return profile.permissions.includes(permission);
}

/** A write grant always includes its matching read grant. */
export function normalizeAdminPermissions(
  permissions: readonly AdminPermission[],
): AdminPermission[] {
  const result = new Set(permissions);
  for (const permission of permissions) {
    if (permission.endsWith(':write')) {
      result.add(permission.replace(':write', ':read') as AdminPermission);
    }
  }
  return ADMIN_PERMISSIONS.filter((permission) => result.has(permission));
}
