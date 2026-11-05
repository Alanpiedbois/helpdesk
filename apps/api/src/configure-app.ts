import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';

/**
 * Middleware and pipes shared by main.ts and the e2e tests,
 * so the tests run against the same setup as production.
 */
export function configureApp(app: INestApplication): void {
  app.use(cookieParser()); // fills req.cookies, read by JwtAuthGuard
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strips fields not declared in the DTO (e.g. "role": "ADMIN" on register)
      forbidNonWhitelisted: true, // ...and answers 400 instead of silently ignoring them
      transform: true,
    }),
  );
}
