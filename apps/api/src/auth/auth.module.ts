import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { JwtGuard } from './jwt.guard';
import { PermissionsGuard } from './permissions.guard';

@Module({
  controllers: [AuthController],
  providers: [JwtGuard, PermissionsGuard],
  exports: [JwtGuard, PermissionsGuard],
})
export class AuthModule {}
