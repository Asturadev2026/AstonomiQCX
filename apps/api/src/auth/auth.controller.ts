import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtGuard, AuthenticatedRequest } from './jwt.guard';

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

@Controller()
export class AuthController {
  @Get('me')
  @UseGuards(JwtGuard)
  me(@Req() req: AuthenticatedRequest) {
    return {
      name: req.user.name,
      initials: initials(req.user.name),
      title: req.user.title || '',
      tenantName: req.tenantName,
    };
  }
}
