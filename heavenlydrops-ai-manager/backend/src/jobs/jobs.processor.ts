/**
 * Jobs Processor
 * 
 * Worker processors for background job queues.
 */

import { Processor, Process, OnQueueFailed } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { CallsService } from '../calls/calls.service';
import { EmailsService } from '../emails/emails.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { JobQueue, CallJobData, EmailJobData } from './jobs.service';

@Processor(JobQueue.CALLS)
export class CallsProcessor {
  private readonly logger = new Logger(CallsProcessor.name);

  constructor(private callsService: CallsService) {}

  @Process('make-call')
  async handleMakeCall(job: Job<CallJobData>) {
    this.logger.log(`Processing call job: ${job.id}`);
    
    const result = await this.callsService.executeCall(job.data.callId);
    
    if (!result.success) {
      throw new Error(result.error);
    }
    
    return result;
  }

  @OnQueueFailed()
  onFailed(job: Job, error: Error) {
    this.logger.error(`Call job ${job.id} failed:`, error.message);
  }
}

@Processor(JobQueue.EMAILS)
export class EmailsProcessor {
  private readonly logger = new Logger(EmailsProcessor.name);

  constructor(private emailsService: EmailsService) {}

  @Process('send-email')
  async handleSendEmail(job: Job<EmailJobData>) {
    this.logger.log(`Processing email job: ${job.id}`);
    
    const result = await this.emailsService.sendTemplateEmail(
      job.data.to,
      job.data.templateName,
      job.data.variables,
      job.data.leadId,
    );
    
    return result;
  }

  @OnQueueFailed()
  onFailed(job: Job, error: Error) {
    this.logger.error(`Email job ${job.id} failed:`, error.message);
  }
}

@Processor(JobQueue.KNOWLEDGE)
export class KnowledgeProcessor {
  private readonly logger = new Logger(KnowledgeProcessor.name);

  constructor(private knowledgeService: KnowledgeService) {}

  @Process('sync-all')
  async handleSyncAll() {
    this.logger.log('Processing knowledge sync job');
    
    const result = await this.knowledgeService.syncAllSources();
    
    return result;
  }

  @OnQueueFailed()
  onFailed(job: Job, error: Error) {
    this.logger.error(`Knowledge job ${job.id} failed:`, error.message);
  }
}

@Processor(JobQueue.APPOINTMENTS)
export class AppointmentsProcessor {
  private readonly logger = new Logger(AppointmentsProcessor.name);

  constructor(private appointmentsService: AppointmentsService) {}

  @Process('send-reminder')
  async handleSendReminder(job: Job<{ appointmentId: string }>) {
    this.logger.log(`Processing reminder job: ${job.id}`);
    
    await this.appointmentsService.sendReminder(job.data.appointmentId);
    
    return { success: true };
  }

  @OnQueueFailed()
  onFailed(job: Job, error: Error) {
    this.logger.error(`Appointment job ${job.id} failed:`, error.message);
  }
}
