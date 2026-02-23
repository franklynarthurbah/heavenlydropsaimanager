/**
 * Emails Service
 * 
 * Manages email automation including inbound processing,
 * AI-generated replies, and template management.
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailLog, EmailDirection, EmailStatus, EmailType } from './entities/email-log.entity';
import { EmailService as EmailIntegrationService } from '../integrations/email.service';
import { AiService } from '../ai/ai.service';
import { LeadsService } from '../leads/leads.service';

export interface IncomingEmail {
  from: string;
  to: string;
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  messageId: string;
  threadId?: string;
  attachments?: any[];
}

export interface SendEmailRequest {
  to: string;
  subject: string;
  bodyHtml: string;
  leadId?: string;
  type: EmailType;
  from?: string;
  cc?: string;
  bcc?: string;
}

@Injectable()
export class EmailsService {
  private readonly logger = new Logger(EmailsService.name);

  constructor(
    @InjectRepository(EmailLog)
    private emailLogRepository: Repository<EmailLog>,
    private emailIntegrationService: EmailIntegrationService,
    private aiService: AiService,
    private leadsService: LeadsService,
  ) {}

  /**
   * Handle incoming email
   */
  async handleIncomingEmail(email: IncomingEmail): Promise<EmailLog> {
    // Find or create lead
    let lead = await this.leadsService.findByEmail(email.from);

    // Create email log
    const emailLog = this.emailLogRepository.create({
      leadId: lead?.id,
      direction: EmailDirection.INBOUND,
      status: EmailStatus.DELIVERED,
      type: EmailType.MANUAL,
      fromAddress: email.from,
      toAddress: email.to,
      subject: email.subject,
      bodyHtml: email.bodyHtml,
      bodyText: email.bodyText,
      externalMessageId: email.messageId,
      threadId: email.threadId,
      deliveredAt: new Date(),
    });

    await this.emailLogRepository.save(emailLog);

    // Generate AI reply if appropriate
    if (this.shouldAutoReply(email)) {
      await this.generateAndSendReply(emailLog, lead);
    }

    return emailLog;
  }

  /**
   * Determine if email should get auto-reply
   */
  private shouldAutoReply(email: IncomingEmail): boolean {
    // Don't auto-reply to certain types
    const noReplyPatterns = [
      'noreply',
      'no-reply',
      'do-not-reply',
      'mailer-daemon',
      'postmaster',
    ];

    const from = email.from.toLowerCase();
    if (noReplyPatterns.some(pattern => from.includes(pattern))) {
      return false;
    }

    // Check for auto-reply headers (would need to parse headers)
    // For now, always attempt auto-reply for customer emails
    return true;
  }

  /**
   * Generate and send AI reply
   */
  private async generateAndSendReply(
    incomingEmail: EmailLog,
    lead: any,
  ): Promise<void> {
    try {
      // Get conversation history
      const emailHistory = await this.emailLogRepository.find({
        where: {
          threadId: incomingEmail.threadId,
          direction: EmailDirection.INBOUND,
        },
        order: { createdAt: 'ASC' },
        take: 5,
      });

      const threadHistory = emailHistory.map(e => `Subject: ${e.subject}\n${e.bodyHtml}`);

      // Generate AI response
      const aiResponse = await this.aiService.generateEmailResponse(
        lead,
        incomingEmail.bodyHtml,
        threadHistory,
      );

      // Check if requires approval
      if (aiResponse.confidence < 0.7) {
        // Mark for manual review
        incomingEmail.aiGeneratedContent = aiResponse.text;
        incomingEmail.aiApproved = false;
        await this.emailLogRepository.save(incomingEmail);
        return;
      }

      // Send the reply
      await this.sendEmail({
        to: incomingEmail.fromAddress,
        subject: `Re: ${incomingEmail.subject}`,
        bodyHtml: aiResponse.text,
        leadId: incomingEmail.leadId,
        type: EmailType.AUTOMATED_REPLY,
      });
    } catch (error) {
      this.logger.error('Error generating email reply:', error.message);
    }
  }

  /**
   * Send email
   */
  async sendEmail(request: SendEmailRequest): Promise<EmailLog> {
    // Send via integration
    const result = await this.emailIntegrationService.sendEmail({
      to: request.to,
      subject: request.subject,
      bodyHtml: request.bodyHtml,
      from: request.from,
      cc: request.cc,
      bcc: request.bcc,
    });

    // Log the email
    const emailLog = this.emailLogRepository.create({
      leadId: request.leadId,
      direction: EmailDirection.OUTBOUND,
      status: result.success ? EmailStatus.SENT : EmailStatus.FAILED,
      type: request.type,
      fromAddress: request.from || 'Heavenly Drops <info@heavenlydrops.com>',
      toAddress: request.to,
      cc: request.cc,
      bcc: request.bcc,
      subject: request.subject,
      bodyHtml: request.bodyHtml,
      sentAt: result.success ? new Date() : null,
    });

    if (!result.success) {
      // Store error info
    }

    return this.emailLogRepository.save(emailLog);
  }

  /**
   * Send template email
   */
  async sendTemplateEmail(
    to: string,
    templateName: string,
    variables: Record<string, string>,
    leadId?: string,
  ): Promise<EmailLog> {
    const result = await this.emailIntegrationService.sendTemplateEmail(
      to,
      templateName,
      variables,
    );

    const emailLog = this.emailLogRepository.create({
      leadId,
      direction: EmailDirection.OUTBOUND,
      status: result.success ? EmailStatus.SENT : EmailStatus.FAILED,
      type: EmailType.AUTOMATED_REPLY,
      toAddress: to,
      subject: variables.subject || 'Heavenly Drops',
      bodyHtml: result.messageId || '',
      sentAt: result.success ? new Date() : null,
      metadata: {
        templateId: templateName,
        tags: Object.keys(variables),
      },
    });

    return this.emailLogRepository.save(emailLog);
  }

  /**
   * Approve AI-generated email
   */
  async approveEmail(
    emailId: string,
    approvedBy: string,
  ): Promise<EmailLog> {
    const emailLog = await this.emailLogRepository.findOne({
      where: { id: emailId },
    });

    if (!emailLog) {
      throw new Error('Email not found');
    }

    emailLog.aiApproved = true;
    emailLog.approvedBy = approvedBy;

    // Send the approved email
    if (emailLog.aiGeneratedContent) {
      await this.sendEmail({
        to: emailLog.fromAddress, // Reply to sender
        subject: `Re: ${emailLog.subject}`,
        bodyHtml: emailLog.aiGeneratedContent,
        leadId: emailLog.leadId,
        type: EmailType.AUTOMATED_REPLY,
      });
    }

    return this.emailLogRepository.save(emailLog);
  }

  /**
   * Get all emails with filters
   */
  async findAll(filters: {
    leadId?: string;
    direction?: EmailDirection;
    status?: EmailStatus;
    type?: EmailType;
  } = {}): Promise<EmailLog[]> {
    const query = this.emailLogRepository.createQueryBuilder('email');

    if (filters.leadId) {
      query.andWhere('email.leadId = :leadId', { leadId: filters.leadId });
    }

    if (filters.direction) {
      query.andWhere('email.direction = :direction', { direction: filters.direction });
    }

    if (filters.status) {
      query.andWhere('email.status = :status', { status: filters.status });
    }

    if (filters.type) {
      query.andWhere('email.type = :type', { type: filters.type });
    }

    return query.orderBy('email.createdAt', 'DESC').getMany();
  }

  /**
   * Get email by ID
   */
  async findOne(id: string): Promise<EmailLog> {
    return this.emailLogRepository.findOne({
      where: { id },
    });
  }

  /**
   * Get emails requiring approval
   */
  async getPendingApprovals(): Promise<EmailLog[]> {
    return this.emailLogRepository.find({
      where: {
        aiApproved: false,
        aiGeneratedContent: Not(''),
      },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Get email statistics
   */
  async getStatistics(): Promise<{
    total: number;
    byDirection: Record<string, number>;
    byStatus: Record<string, number>;
    byType: Record<string, number>;
    openRate: number;
    clickRate: number;
  }> {
    const total = await this.emailLogRepository.count();

    const byDirection = await this.emailLogRepository
      .createQueryBuilder('e')
      .select('e.direction', 'direction')
      .addSelect('COUNT(*)', 'count')
      .groupBy('e.direction')
      .getRawMany();

    const byStatus = await this.emailLogRepository
      .createQueryBuilder('e')
      .select('e.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('e.status')
      .getRawMany();

    const byType = await this.emailLogRepository
      .createQueryBuilder('e')
      .select('e.type', 'type')
      .addSelect('COUNT(*)', 'count')
      .groupBy('e.type')
      .getRawMany();

    const opened = await this.emailLogRepository.count({
      where: { openedAt: Not(null) },
    });

    const clicked = await this.emailLogRepository.count({
      where: { clickedAt: Not(null) },
    });

    return {
      total,
      byDirection: byDirection.reduce((acc, curr) => {
        acc[curr.direction] = parseInt(curr.count);
        return acc;
      }, {}),
      byStatus: byStatus.reduce((acc, curr) => {
        acc[curr.status] = parseInt(curr.count);
        return acc;
      }, {}),
      byType: byType.reduce((acc, curr) => {
        acc[curr.type] = parseInt(curr.count);
        return acc;
      }, {}),
      openRate: total > 0 ? (opened / total) * 100 : 0,
      clickRate: total > 0 ? (clicked / total) * 100 : 0,
    };
  }

  /**
   * Track email open
   */
  async trackOpen(emailId: string, trackingData: any): Promise<void> {
    const emailLog = await this.emailLogRepository.findOne({
      where: { id: emailId },
    });

    if (emailLog) {
      emailLog.openedAt = new Date();
      emailLog.trackingData = {
        ...emailLog.trackingData,
        ...trackingData,
        openCount: (emailLog.trackingData?.openCount || 0) + 1,
      };
      await this.emailLogRepository.save(emailLog);
    }
  }
}

// Helper for TypeORM query
import { Not } from 'typeorm';
