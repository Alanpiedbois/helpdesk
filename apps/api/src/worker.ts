import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module.js';

async function bootstrap() {
  // Application context = Nest's dependency injection without an HTTP server.
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks(); // closes RabbitMQ channels cleanly: in-flight messages get redelivered
  new Logger('Worker').log('Worker started');
}
await bootstrap();
