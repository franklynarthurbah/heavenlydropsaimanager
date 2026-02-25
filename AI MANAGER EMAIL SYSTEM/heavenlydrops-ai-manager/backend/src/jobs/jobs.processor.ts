/**
 * Jobs Processor
 *
 * Worker processors for background job queues.
 * Uses @nestjs/bullmq WorkerHost pattern (NOT the old @nestjs/bull @Process decorator).
 */

import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { CallsService } from '../calls/calls.service';
import { EmailsService } from '../emails/emails.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { JobQueue, CallJobData, EmailJobData } from './jobs.service';

// ─── Calls Processor ─────────────────────────────────────────────────────────

@Processor(JobQueue.CALLS)
export class CallsProcessor extends WorkerHost {
  private readonly logger = new Logger(CallsProcessor.name);

  constructor(private callsService: CallsService) {
    super();
  }

  async process(job: Job<CallJobData>): Promise<any> {
    switch (job.name) {
      case 'make-call':
        return this.handleMakeCall(job);
      default:
        this.logger.warn(`Unknown calls job: ${job.name}`);
    }
  }

  private async handleMakeCall(job: Job<CallJobData>) {
    this.logger.log(`Processing call job ${job.id} for lead ${job.data.leadId}`);
    const result = await this.callsService.executeCall(job.data.callId);
    if (!result.success) {
      throw new Error(result.error ?? 'Call failed');
    }
    return result;
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Call job ${job.id} failed: ${error.message}`);
  }
}

// ─── Emails Processor ────────────────────────────────────────────────────────

@Processor(JobQueue.EMAILS)
export class EmailsProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailsProcessor.name);

  constructor(private emailsService: EmailsService) {
    super();
  }

  async process(job: Job<EmailJobData>): Promise<any> {
    switch (job.name) {
      case 'send-email':
        return this.handleSendEmail(job);
      default:
        this.logger.warn(`Unknown emails job: ${job.name}`);
    }
  }

  private async handleSendEmail(job: Job<EmailJobData>) {
    this.logger.log(`Processing email job ${job.id} to ${job.data.to}`);
    return this.emailsService.sendTemplateEmail(
      job.data.to,
      job.data.templateName,
      job.data.variables,
      job.data.leadId,
    );
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Email job ${job.id} failed: ${error.message}`);
  }
}

// ─── Knowledge Processor ─────────────────────────────────────────────────────

@Processor(JobQueue.KNOWLEDGE)
export class KnowledgeProcessor extends WorkerHost {
  private readonly logger = new Logger(KnowledgeProcessor.name);

  constructor(private knowledgeService: KnowledgeService) {
    super();
  }

  async process(job: Job): Promise<any> {
    switch (job.name) {
      case 'sync-all':
        this.logger.log('Processing knowledge sync job');
        return this.knowledgeService.syncAllSources();
      default:
        this.logger.warn(`Unknown knowledge job: ${job.name}`);
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Knowledge job ${job.id} failed: ${error.message}`);
  }
}

// ─── Appointments Processor ──────────────────────────────────────────────────

@Processor(JobQueue.APPOINTMENTS)
export class AppointmentsProcessor extends WorkerHost {
  private readonly logger = new Logger(AppointmentsProcessor.name);

  constructor(private appointmentsService: AppointmentsService) {
    super();
  }

  async process(job: Job<{ appointmentId: string }>): Promise<any> {
    switch (job.name) {
      case 'send-reminder':
        this.logger.log(`Processing reminder for appointment ${job.data.appointmentId}`);
        await this.appointmentsService.sendReminder(job.data.appointmentId);
        return { success: true };
      default:
        this.logger.warn(`Unknown appointments job: ${job.name}`);
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Appointment job ${job.id} failed: ${error.message}`);
  }
}
