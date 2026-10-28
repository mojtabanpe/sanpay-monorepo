import { SetMetadata } from '@nestjs/common';
import type { AdminPermission, AdminResource } from '@sanpay/models';

export const ADMIN_RESOURCE = 'admin_resource';
export const ADMIN_REQUIRED_PERMISSIONS = 'admin_permissions';
export const AdminAccess = (resource: AdminResource) =>
  SetMetadata(ADMIN_RESOURCE, resource);
/** Alternatives, used for shared reference lists and read-only inquiries. */
export const AnyAdminPermission = (...permissions: AdminPermission[]) =>
  SetMetadata(ADMIN_REQUIRED_PERMISSIONS, permissions);
