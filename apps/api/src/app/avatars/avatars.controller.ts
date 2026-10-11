import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { AVATAR_FILE, AvatarService } from './avatar.service';

/**
 * سرو عکس پروفایل — بدون JWT، چون `<img>` هدر Authorization نمی‌فرستد.
 * فقط نام‌هایی که خودمان ساخته‌ایم پذیرفته می‌شوند (path traversal ممکن نیست)
 * و فایل هیچ‌وقت عوض نمی‌شود — آپلود تازه نام تازه می‌گیرد — پس cache طولانی
 * امن است.
 */
@Controller('avatars')
export class AvatarsController {
  constructor(private readonly avatars: AvatarService) {}

  @Get(':file')
  serve(@Param('file') file: string, @Res() response: Response): void {
    if (!AVATAR_FILE.test(file)) throw new NotFoundException();
    response.sendFile(
      file,
      {
        root: this.avatars.dir,
        headers: {
          'Content-Type': 'image/webp',
          'Cache-Control': 'public, max-age=31536000, immutable',
          'X-Content-Type-Options': 'nosniff',
        },
      },
      (error) => {
        if (error && !response.headersSent) response.status(404).end();
      },
    );
  }
}
