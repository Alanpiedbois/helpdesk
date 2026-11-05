import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // The React app runs on another origin (Vite dev server), so the browser needs CORS.
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173' });
  app.enableShutdownHooks(); // lets onModuleDestroy run, e.g. to close the DB pool
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
