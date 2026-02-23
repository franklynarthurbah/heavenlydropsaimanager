/**
 * Jobs Module
 * 
 * Configures BullMQ queues and processors.
 */

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { JobsService, JobQueue } from './jobs.service';
import { CallsProcessor, EmailsProcessor, KnowledgeProcessor, AppointmentsProcessor } from './jobs.processor';
import { CallsModule } from '../calls/calls.module';
import { EmailsModule } from '../emails/emails.module';
import { AppointmentsModule } from '../appointments/appointments.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: JobQueue.CALLS },
      { name: JobQueue.EMAILS },
      { name: JobQueue.KNOWLEDGE },
      { name: JobQueue.APPOINTMENTS },
    ),
    CallsModule,
    EmailsModule,
    AppointmentsModule,
    KnowledgeModule,
  ],
  providers: [
    JobsService,
    CallsProcessor,
    EmailsProcessor,
    KnowledgeProcessor,
    AppointmentsProcessor,
  ],
  exports: [JobsService],
})
export class JobsModule {}
