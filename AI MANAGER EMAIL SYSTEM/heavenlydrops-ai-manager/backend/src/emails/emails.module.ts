/**
 * Emails Module (v2 – Full Mail Server Integration)
 *
 * Services wired:
 *   EmailsService, EmailInboxService, AiDetectorService,
 *   AttachmentProcessorService, FormParserService,
 *   MailDiagnosticsService, AutoUpdaterService
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bull';

import { EmailsService } from './emails.service';
import { EmailsController } from './emails.controller';
import { EmailInboxService } from './email-inbox.service';
import { AiDetectorService } from './ai-detector.service';
import { AttachmentProcessorService } from './attachment-processor.service';
import { FormParserService } from './form-parser.service';
import { MailDiagnosticsService } from './mail-diagnostics.service';
import { AutoUpdaterService } from './auto-updater.service';

import { EmailLog } from './entities/email-log.entity';
import { IntegrationsModule } from '../integrations/integrations.module';
import { AiModule } from '../ai/ai.module';
import { LeadsModule } from '../leads/leads.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([EmailLog]),
    ScheduleModule.forRoot(),
    BullModule.registerQueue({ name: 'email-processing' }),
    IntegrationsModule,
    AiModule,
    LeadsModule,
  ],
  controllers: [EmailsController],
  providers: [
    EmailsService,
    EmailInboxService,
    AiDetectorService,
    AttachmentProcessorService,
    FormParserService,
    MailDiagnosticsService,
    AutoUpdaterService,
  ],
  exports: [
    EmailsService,
    EmailInboxService,
    AiDetectorService,
    AttachmentProcessorService,
    FormParserService,
    MailDiagnosticsService,
    AutoUpdaterService,
  ],
})
export class EmailsModule {}
