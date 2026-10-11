import { Module } from '@nestjs/common';
import { AvatarService } from './avatar.service';
import { AvatarsController } from './avatars.controller';

@Module({
  controllers: [AvatarsController],
  providers: [AvatarService],
  exports: [AvatarService],
})
export class AvatarsModule {}
