import { SetMetadata } from '@nestjs/common';
import { AdminRole } from '@sanpay/models';

export const REQUIRED_ROLES = 'sanpay:required-roles';

/**
 * محدودکردن یک مسیر به نقش‌های مشخص.
 * روی مسیرهای نوشتنی می‌آید تا VIEWER فقط بتواند بخواند.
 */
export const Roles = (...roles: AdminRole[]) => SetMetadata(REQUIRED_ROLES, roles);

/** همهٔ نقش‌هایی که اجازهٔ تغییر داده دارند */
export const WRITE_ROLES: AdminRole[] = ['SUPER_ADMIN', 'ADMIN'];
