/**
 * Calls Service
 * 
 * Manages AI voice calls including scheduling, execution,
 * transcription, and summary generation.
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { CallLog, CallStatus, CallDirection } from './entities/call-log.entity';
import { VoiceService } from '../integrations/voice.service';
import { AiService } from '../ai/ai.service';
import { EmailService } from '../integrations/email.service';
import { LeadsService } from '../leads/leads.service';
import { ConfigService } from '@nestjs/config';

export interface ScheduleCallRequest {
  leadId: string;
  phoneNumber: string;
  scheduledFor?: Date;
  notes?: string;
}

@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);

  constructor(
    @InjectRepository(CallLog)
    private callLogRepository: Repository<CallLog>,
    private voiceService: VoiceService,
    private aiService: AiService,
    private emailService: EmailService,
    private leadsService: LeadsService,
    private configService: ConfigService,
  ) {}

  /**
   * Schedule a call
   */
  async scheduleCall(request: ScheduleCallRequest): Promise<CallLog> {
    const callLog = this.callLogRepository.create({
      leadId: request.leadId,
      phoneNumber: request.phoneNumber,
      scheduledFor: request.scheduledFor || new Date(),
      status: request.scheduledFor ? CallStatus.SCHEDULED : CallStatus.PENDING,
      direction: CallDirection.OUTBOUND,
    });

    return this.callLogRepository.save(callLog);
  }

  /**
   * Execute scheduled call
   */
  async executeCall(callId: string): Promise<{ success: boolean; error?: string }> {
    const callLog = await this.callLogRepository.findOne({
      where: { id: callId },
      relations: ['lead'],
    });

    if (!callLog) {
      return { success: false, error: 'Call not found' };
    }

    if (!callLog.lead) {
      return { success: false, error: 'Lead not found' };
    }

    try {
      const result = await this.voiceService.makeCall({
        to: callLog.phoneNumber,
        leadId: callLog.leadId,
        lead: callLog.lead,
      });

      if (result.success) {
        callLog.externalCallId = result.callSid;
        callLog.status = CallStatus.IN_PROGRESS;
        callLog.startedAt = new Date();
        await this.callLogRepository.save(callLog);
      } else {
        callLog.status = CallStatus.FAILED;
        callLog.errorMessage = result.error;
        await this.callLogRepository.save(callLog);
      }

      return result;
    } catch (error) {
      this.logger.error('Error executing call:', error.message);
      callLog.status = CallStatus.FAILED;
      callLog.errorMessage = error.message;
      await this.callLogRepository.save(callLog);
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle call status update from Twilio webhook
   */
  async handleStatusUpdate(
    callSid: string,
    status: string,
    duration?: number,
    recordingUrl?: string,
  ): Promise<void> {
    const callLog = await this.callLogRepository.findOne({
      where: { externalCallId: callSid },
      relations: ['lead'],
    });

    if (!callLog) {
      this.logger.warn(`Call log not found for SID: ${callSid}`);
      return;
    }

    // Map Twilio status to our status
    const statusMap: Record<string, CallStatus> = {
      'queued': CallStatus.SCHEDULED,
      'ringing': CallStatus.IN_PROGRESS,
      'in-progress': CallStatus.IN_PROGRESS,
      'completed': CallStatus.COMPLETED,
      'busy': CallStatus.BUSY,
      'failed': CallStatus.FAILED,
      'no-answer': CallStatus.NO_ANSWER,
      'canceled': CallStatus.CANCELLED,
    };

    callLog.status = statusMap[status] || CallStatus.FAILED;
    callLog.durationSeconds = duration;

    if (recordingUrl) {
      callLog.recordingUrls = {
        full: recordingUrl,
        segments: [],
      };
    }

    if (status === 'completed') {
      callLog.endedAt = new Date();

      // Generate summary and send email
      await this.processCompletedCall(callLog);
    }

    await this.callLogRepository.save(callLog);
  }

  /**
   * Process completed call - generate summary and send email
   */
  private async processCompletedCall(callLog: CallLog): Promise<void> {
    try {
      // Get transcript (if available)
      let transcript = callLog.transcript || '';

      if (callLog.recordingUrls?.full && !transcript) {
        // Transcribe recording
        transcript = await this.voiceService.transcribeRecording(callLog.recordingUrls.full);
        callLog.transcript = transcript;
      }

      // Generate AI summary
      if (transcript) {
        const summary = await this.aiService.summarizeConversation([
          { sender: 'AI', content: 'Call initiated', timestamp: callLog.startedAt },
          { sender: 'Customer', content: transcript, timestamp: callLog.endedAt },
        ]);

        callLog.aiSummary = summary.text;
        callLog.aiExtractedData = {
          qualificationAnswers: {},
          interestLevel: 'unknown',
          objections: [],
          nextSteps: summary.suggestedActions?.join(', ') || 'Follow up required',
        };

        // Extract qualification data
        const qualificationData = await this.aiService.extractQualificationData(transcript);
        await this.leadsService.updateQualification(callLog.leadId, qualificationData);
      }

      await this.callLogRepository.save(callLog);

      // Send summary email to team
      await this.sendCallSummaryEmail(callLog);
    } catch (error) {
      this.logger.error('Error processing completed call:', error.message);
    }
  }

  /**
   * Send call summary email
   */
  private async sendCallSummaryEmail(callLog: CallLog): Promise<void> {
    const teamEmail = this.configService.get('TEAM_EMAIL', 'team@heavenlydrops.com');

    await this.emailService.sendCallSummary(teamEmail, {
      firstName: callLog.lead?.firstName || 'Unknown',
      lastName: callLog.lead?.lastName || '',
      phoneNumber: callLog.phoneNumber,
      callDate: callLog.startedAt?.toISOString() || '',
      duration: `${Math.floor((callLog.durationSeconds || 0) / 60)}:${(callLog.durationSeconds || 0) % 60}`,
      summary: callLog.aiSummary || 'No summary available',
      keyPoints: callLog.aiExtractedData?.objections?.join(', ') || 'None recorded',
      nextSteps: callLog.aiExtractedData?.nextSteps || 'Follow up required',
    });
  }

  /**
   * Get call by ID
   */
  async findOne(id: string): Promise<CallLog> {
    return this.callLogRepository.findOne({
      where: { id },
      relations: ['lead'],
    });
  }

  /**
   * Get all calls with filters
   */
  async findAll(filters: {
    leadId?: string;
    status?: CallStatus;
    dateFrom?: Date;
    dateTo?: Date;
  } = {}): Promise<CallLog[]> {
    const query = this.callLogRepository.createQueryBuilder('call')
      .leftJoinAndSelect('call.lead', 'lead');

    if (filters.leadId) {
      query.andWhere('call.leadId = :leadId', { leadId: filters.leadId });
    }

    if (filters.status) {
      query.andWhere('call.status = :status', { status: filters.status });
    }

    if (filters.dateFrom) {
      query.andWhere('call.createdAt >= :dateFrom', { dateFrom: filters.dateFrom });
    }

    if (filters.dateTo) {
      query.andWhere('call.createdAt <= :dateTo', { dateTo: filters.dateTo });
    }

    return query.orderBy('call.createdAt', 'DESC').getMany();
  }

  /**
   * Get scheduled calls that need to be executed
   */
  async getPendingScheduledCalls(): Promise<CallLog[]> {
    return this.callLogRepository.find({
      where: {
        status: CallStatus.SCHEDULED,
        scheduledFor: LessThan(new Date()),
      },
      relations: ['lead'],
    });
  }

  /**
   * Get call statistics
   */
  async getStatistics(): Promise<{
    total: number;
    byStatus: Record<string, number>;
    totalDuration: number;
    averageDuration: number;
  }> {
    const total = await this.callLogRepository.count();

    const byStatus = await this.callLogRepository
      .createQueryBuilder('c')
      .select('c.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('c.status')
      .getRawMany();

    const durationStats = await this.callLogRepository
      .createQueryBuilder('c')
      .select('SUM(c.durationSeconds)', 'total')
      .addSelect('AVG(c.durationSeconds)', 'average')
      .where('c.durationSeconds IS NOT NULL')
      .getRawOne();

    return {
      total,
      byStatus: byStatus.reduce((acc, curr) => {
        acc[curr.status] = parseInt(curr.count);
        return acc;
      }, {}),
      totalDuration: parseInt(durationStats?.total) || 0,
      averageDuration: parseInt(durationStats?.average) || 0,
    };
  }

  /**
   * Retry failed call
   */
  async retryCall(callId: string): Promise<{ success: boolean; error?: string }> {
    const callLog = await this.callLogRepository.findOne({
      where: { id: callId },
    });

    if (!callLog) {
      return { success: false, error: 'Call not found' };
    }

    if (callLog.retryCount >= 3) {
      return { success: false, error: 'Maximum retry attempts reached' };
    }

    callLog.retryCount++;
    callLog.status = CallStatus.SCHEDULED;
    callLog.scheduledFor = new Date(Date.now() + 5 * 60 * 1000); // Retry in 5 minutes
    await this.callLogRepository.save(callLog);

    return { success: true };
  }
}
