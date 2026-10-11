import { Module } from '@nestjs/common';
import { AvatarsModule } from '../avatars/avatars.module';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

@Module({
  imports: [AvatarsModule],
  controllers: [ProfileController],
  providers: [ProfileService, JwtAuthGuard],
})
export class ProfileModule {}
