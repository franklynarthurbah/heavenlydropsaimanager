/**
 * Jobs Service
 * 
 * Background job processor using BullMQ.
 * Handles scheduled tasks like:
 * - Outbound calls
 * - Email sending
 * - Knowledge sync
 * - Appointment reminders
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CallsService } from '../calls/calls.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { KnowledgeService } from '../knowledge/knowledge.service';

export enum JobQueue {
  CALLS = 'calls',
  EMAILS = 'emails',
  KNOWLEDGE = 'knowledge',
  APPOINTMENTS = 'appointments',
}

export interface CallJobData {
  callId: string;
  leadId: string;
  phoneNumber: string;
}

export interface EmailJobData {
  to: string;
  templateName: string;
  variables: Record<string, string>;
  leadId?: string;
}

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    @InjectQueue(JobQueue.CALLS) private callsQueue: Queue,
    @InjectQueue(JobQueue.EMAILS) private emailsQueue: Queue,
    @InjectQueue(JobQueue.KNOWLEDGE) private knowledgeQueue: Queue,
    @InjectQueue(JobQueue.APPOINTMENTS) private appointmentsQueue: Queue,
    private callsService: CallsService,
    private appointmentsService: AppointmentsService,
    private knowledgeService: KnowledgeService,
  ) {}

  /**
   * Schedule a call job
   */
  async scheduleCall(data: CallJobData, delay?: number): Promise<void> {
    await this.callsQueue.add('make-call', data, {
      delay,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 60000,
      },
    });
    this.logger.log(`Scheduled call job for ${data.phoneNumber}`);
  }

  /**
   * Schedule email job
   */
  async scheduleEmail(data: EmailJobData, delay?: number): Promise<void> {
    await this.emailsQueue.add('send-email', data, {
      delay,
      attempts: 3,
    });
    this.logger.log(`Scheduled email job for ${data.to}`);
  }

  /**
   * Schedule knowledge sync
   */
  async scheduleKnowledgeSync(): Promise<void> {
    await this.knowledgeQueue.add('sync-all', {}, {
      repeat: {
        cron: '0 2 * * *', // Daily at 2 AM
      },
    });
    this.logger.log('Scheduled knowledge sync job');
  }

  /**
   * Schedule appointment reminder
   */
  async scheduleAppointmentReminder(appointmentId: string, reminderTime: Date): Promise<void> {
    const delay = reminderTime.getTime() - Date.now();
    
    if (delay > 0) {
      await this.appointmentsQueue.add('send-reminder', { appointmentId }, {
        delay,
      });
      this.logger.log(`Scheduled reminder for appointment ${appointmentId}`);
    }
  }

  /**
   * Process scheduled calls (runs every minute)
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async processScheduledCalls(): Promise<void> {
    try {
      const pendingCalls = await this.callsService.getPendingScheduledCalls();
      
      for (const call of pendingCalls) {
        this.logger.log(`Processing scheduled call: ${call.id}`);
        await this.callsService.executeCall(call.id);
      }
    } catch (error) {
      this.logger.error('Error processing scheduled calls:', error.message);
    }
  }

  /**
   * Send appointment reminders (runs every hour)
   */
  @Cron(CronExpression.EVERY_HOUR)
  async sendAppointmentReminders(): Promise<void> {
    try {
      const upcomingAppointments = await this.appointmentsService.getUpcomingAppointments(24);
      
      for (const appointment of upcomingAppointments) {
        if (appointment.sendReminders && !appointment.reminderLog?.length) {
          this.logger.log(`Sending reminder for appointment: ${appointment.id}`);
          await this.appointmentsService.sendReminder(appointment.id);
        }
      }
    } catch (error) {
      this.logger.error('Error sending appointment reminders:', error.message);
    }
  }

  /**
   * Sync knowledge daily
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async syncKnowledge(): Promise<void> {
    try {
      this.logger.log('Starting daily knowledge sync');
      const result = await this.knowledgeService.syncAllSources();
      this.logger.log('Knowledge sync completed:', result);
    } catch (error) {
      this.logger.error('Error syncing knowledge:', error.message);
    }
  }

  /**
   * Clean up old data (runs weekly)
   */
  @Cron(CronExpression.EVERY_WEEK)
  async cleanupOldData(): Promise<void> {
    try {
      this.logger.log('Starting weekly cleanup');
      // Implement cleanup logic here
      // - Archive old conversations
      // - Delete old logs
      // - Compress recordings
    } catch (error) {
      this.logger.error('Error during cleanup:', error.message);
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<{
    calls: { waiting: number; active: number; completed: number; failed: number };
    emails: { waiting: number; active: number; completed: number; failed: number };
    knowledge: { waiting: number; active: number; completed: number; failed: number };
    appointments: { waiting: number; active: number; completed: number; failed: number };
  }> {
    const [callsWaiting, callsActive, callsCompleted, callsFailed] = await Promise.all([
      this.callsQueue.getWaitingCount(),
      this.callsQueue.getActiveCount(),
      this.callsQueue.getCompletedCount(),
      this.callsQueue.getFailedCount(),
    ]);

    const [emailsWaiting, emailsActive, emailsCompleted, emailsFailed] = await Promise.all([
      this.emailsQueue.getWaitingCount(),
      this.emailsQueue.getActiveCount(),
      this.emailsQueue.getCompletedCount(),
      this.emailsQueue.getFailedCount(),
    ]);

    const [knowledgeWaiting, knowledgeActive, knowledgeCompleted, knowledgeFailed] = await Promise.all([
      this.knowledgeQueue.getWaitingCount(),
      this.knowledgeQueue.getActiveCount(),
      this.knowledgeQueue.getCompletedCount(),
      this.knowledgeQueue.getFailedCount(),
    ]);

    const [appointmentsWaiting, appointmentsActive, appointmentsCompleted, appointmentsFailed] = await Promise.all([
      this.appointmentsQueue.getWaitingCount(),
      this.appointmentsQueue.getActiveCount(),
      this.appointmentsQueue.getCompletedCount(),
      this.appointmentsQueue.getFailedCount(),
    ]);

    return {
      calls: {
        waiting: callsWaiting,
        active: callsActive,
        completed: callsCompleted,
        failed: callsFailed,
      },
      emails: {
        waiting: emailsWaiting,
        active: emailsActive,
        completed: emailsCompleted,
        failed: emailsFailed,
      },
      knowledge: {
        waiting: knowledgeWaiting,
        active: knowledgeActive,
        completed: knowledgeCompleted,
        failed: knowledgeFailed,
      },
      appointments: {
        waiting: appointmentsWaiting,
        active: appointmentsActive,
        completed: appointmentsCompleted,
        failed: appointmentsFailed,
      },
    };
  }
}
