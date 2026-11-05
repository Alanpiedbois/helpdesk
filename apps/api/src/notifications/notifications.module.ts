import { Module } from '@nestjs/common';
import { MailerService } from './mailer.service.js';
import { NotificationsConsumer } from './notifications.consumer.js';

@Module({
  providers: [MailerService, NotificationsConsumer],
})
export class NotificationsModule {}
