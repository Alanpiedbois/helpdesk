import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './configure-app.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  // The React app runs on another origin (Vite dev server). credentials: true lets
  // the browser send the session cookie on cross-origin requests.
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
  });
  app.enableShutdownHooks(); // lets onModuleDestroy run, e.g. to close the DB pool
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
