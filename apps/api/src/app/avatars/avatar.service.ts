import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';

/** فایلی که multer در حافظه نگه داشته — فقط همین چند فیلد لازم است */
export interface UploadedImage {
  buffer: Buffer;
  size: number;
}

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
/** نام فایل‌هایی که خودمان می‌سازیم — هر چیز دیگری در مسیر GET رد می‌شود */
export const AVATAR_FILE = /^[a-f0-9]{32}\.webp$/;
const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp']);
const SIZE = 512;

/**
 * عکس پروفایل کارمند — اولین آپلود فایل پروژه.
 *
 * فایل ورودی هیچ‌وقت همان‌طور که رسیده ذخیره نمی‌شود: `sharp` آن را واقعاً
 * decode می‌کند (پس نوع از روی محتوا تشخیص داده می‌شود، نه پسوند یا
 * Content-Type که دست کاربر است)، جهت EXIF را اعمال می‌کند، به مربع ۵۱۲ برش
 * می‌دهد و WebP تازه می‌نویسد. خروجی sharp متادیتا ندارد، پس EXIF — از جمله
 * موقعیت GPS عکس گوشی — همراه فایل نمی‌ماند.
 *
 * فایل‌ها در `UPLOADS_DIR/avatars` (volume دیتای API) با نام تصادفی ۱۲۸ بیتی
 * ذخیره می‌شوند و بدون احراز هویت سرو می‌شوند، چون `<img>` نمی‌تواند هدر
 * Authorization بفرستد؛ نام حدس‌ناپذیر جای کنترل دسترسی را می‌گیرد.
 */
@Injectable()
export class AvatarService {
  private readonly logger = new Logger(AvatarService.name);
  readonly dir = resolve(process.env.UPLOADS_DIR || 'data/uploads', 'avatars');

  constructor(private readonly prisma: PrismaService) {}

  static url(file: string | null | undefined): string | null {
    return file ? `/api/avatars/${file}` : null;
  }

  async set(employeeId: string, image: UploadedImage | undefined) {
    if (!image?.buffer?.length) {
      throw new BadRequestException('فایل عکس ارسال نشده است');
    }
    if (image.size > AVATAR_MAX_BYTES) {
      throw new PayloadTooLargeException('حجم عکس باید حداکثر ۲ مگابایت باشد');
    }
    const employee = await this.mustExist(employeeId);
    const webp = await this.normalize(image.buffer);

    const file = `${randomBytes(16).toString('hex')}.webp`;
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, file), webp, { flag: 'wx' });
    try {
      await this.prisma.employee.update({
        where: { id: employeeId },
        data: { avatarFile: file },
      });
    } catch (error) {
      await this.unlink(file);
      throw error;
    }
    await this.unlink(employee.avatarFile);
    return { avatarUrl: AvatarService.url(file) };
  }

  async remove(employeeId: string) {
    const employee = await this.mustExist(employeeId);
    await this.prisma.employee.update({
      where: { id: employeeId },
      data: { avatarFile: null },
    });
    await this.unlink(employee.avatarFile);
    return { avatarUrl: null };
  }

  private async normalize(input: Buffer): Promise<Buffer> {
    let format: string | undefined;
    try {
      // سقف پیکسل جلوی «بمب تصویری» را می‌گیرد: PNG کوچکی که به میلیاردها
      // پیکسل باز می‌شود
      const image = sharp(input, { limitInputPixels: 40_000_000, failOn: 'error' });
      format = (await image.metadata()).format;
      if (!format || !ACCEPTED_FORMATS.has(format)) throw new Error(format);
      return await image
        .rotate()
        .resize(SIZE, SIZE, { fit: 'cover' })
        .webp({ quality: 82 })
        .toBuffer();
    } catch {
      throw new BadRequestException('فقط عکس JPEG، PNG یا WebP پذیرفته می‌شود');
    }
  }

  private async mustExist(id: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, avatarFile: true },
    });
    if (!employee) throw new NotFoundException('کارمند پیدا نشد');
    return employee;
  }

  /** فایل قدیمی پاک می‌شود؛ شکستش نباید درخواست را خراب کند */
  private async unlink(file: string | null | undefined): Promise<void> {
    if (!file || !AVATAR_FILE.test(file)) return;
    await rm(join(this.dir, file), { force: true }).catch((error: unknown) =>
      this.logger.warn(`حذف عکس قدیمی ناموفق بود: ${String(error)}`),
    );
  }
}
