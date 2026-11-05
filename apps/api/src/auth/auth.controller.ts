import { Body, Controller, Get, HttpCode, Post, Res } from '@nestjs/common';
import type { CookieOptions, Response } from 'express';
import { ACCESS_COOKIE, SESSION_TTL_SECONDS } from './auth.constants.js';
import { AuthService, PublicUser } from './auth.service.js';
import { CurrentUser, Public } from './decorators.js';
import type { AuthUser } from './decorators.js';
import { LoginDto, RegisterDto } from './dto.js';

/**
 * The JWT travels in an httpOnly cookie, not in localStorage:
 * - httpOnly: JavaScript cannot read it, so an XSS flaw cannot steal the session.
 * - sameSite=lax: the browser does not send it on cross-site POSTs, which blocks CSRF.
 * - secure in production: only sent over HTTPS.
 */
function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_TTL_SECONDS * 1000,
    path: '/',
  };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PublicUser> {
    const user = await this.auth.register(dto);
    res.cookie(ACCESS_COOKIE, await this.auth.signToken(user), cookieOptions());
    return user;
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PublicUser> {
    const user = await this.auth.validateCredentials(dto);
    res.cookie(ACCESS_COOKIE, await this.auth.signToken(user), cookieOptions());
    return user;
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response): void {
    const { maxAge: _maxAge, ...options } = cookieOptions();
    res.clearCookie(ACCESS_COOKIE, options);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<PublicUser> {
    return this.auth.findById(user.id);
  }
}
