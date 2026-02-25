/**
 * Email Service
 * 
 * Handles email sending via SMTP or SendGrid.
 * Supports both transactional and marketing emails.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IntegrationCredential, IntegrationType } from './entities/integration-credential.entity';

export interface EmailMessage {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  attachments?: {
    filename: string;
    content: Buffer;
    contentType?: string;
  }[];
  from?: string;
  replyTo?: string;
}

export interface EmailTemplate {
  name: string;
  subject: string;
  bodyHtml: string;
  variables: string[];
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor(
    private configService: ConfigService,
    @InjectRepository(IntegrationCredential)
    private credentialRepository: Repository<IntegrationCredential>,
  ) {
    this.initializeTransporter();
  }

  /**
   * Initialize SMTP transporter
   */
  private async initializeTransporter(): Promise<void> {
    try {
      const credentials = await this.credentialRepository.findOne({
        where: {
          integrationType: IntegrationType.SMTP,
          status: 'active',
        },
      });

      if (credentials) {
        const creds = JSON.parse(credentials.credentials);
        this.transporter = nodemailer.createTransport({
          host: creds.host,
          port: creds.port || 587,
          secure: creds.secure || false,
          auth: {
            user: creds.user,
            pass: creds.pass,
          },
        });

        // Verify connection
        await this.transporter.verify();
        this.logger.log('SMTP transporter initialized successfully');
      } else {
        // Fallback to environment variables
        this.transporter = nodemailer.createTransport({
          host: this.configService.get('SMTP_HOST', 'smtp.gmail.com'),
          port: this.configService.get('SMTP_PORT', 587),
          secure: false,
          auth: {
            user: this.configService.get('SMTP_USER'),
            pass: this.configService.get('SMTP_PASS'),
          },
        });
      }
    } catch (error) {
      this.logger.error('Failed to initialize SMTP transporter:', error.message);
    }
  }

  /**
   * Send email
   */
  async sendEmail(email: EmailMessage): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      if (!this.transporter) {
        await this.initializeTransporter();
      }

      const defaultFrom = this.configService.get(
        'EMAIL_FROM',
        'Heavenly Drops <info@heavenlydrops.com>',
      );

      const mailOptions: nodemailer.SendMailOptions = {
        from: email.from || defaultFrom,
        to: email.to,
        cc: email.cc,
        bcc: email.bcc,
        subject: email.subject,
        html: email.bodyHtml,
        text: email.bodyText,
        attachments: email.attachments?.map(att => ({
          filename: att.filename,
          content: att.content,
          contentType: att.contentType,
        })),
        replyTo: email.replyTo,
      };

      const result = await this.transporter.sendMail(mailOptions);

      this.logger.log(`Email sent to ${email.to}: ${result.messageId}`);

      return {
        success: true,
        messageId: result.messageId,
      };
    } catch (error) {
      this.logger.error('Error sending email:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Send email using template
   */
  async sendTemplateEmail(
    to: string,
    templateName: string,
    variables: Record<string, string>,
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const templates: Record<string, EmailTemplate> = {
      welcome: {
        name: 'welcome',
        subject: 'Welcome to Heavenly Drops!',
        bodyHtml: `
          <h1>Welcome {{firstName}}!</h1>
          <p>Thank you for your interest in Heavenly Drops. We're excited to help you with your {{program}} journey.</p>
          <p>One of our consultants will contact you shortly.</p>
          <p>Best regards,<br>Heavenly Drops Team</p>
        `,
        variables: ['firstName', 'program'],
      },
      appointment_confirmation: {
        name: 'appointment_confirmation',
        subject: 'Your Consultation is Confirmed',
        bodyHtml: `
          <h1>Hello {{firstName}},</h1>
          <p>Your consultation has been scheduled for:</p>
          <p><strong>Date:</strong> {{date}}</p>
          <p><strong>Time:</strong> {{time}}</p>
          <p><strong>Meeting Link:</strong> <a href="{{meetingLink}}">Join Teams Meeting</a></p>
          <p>We look forward to speaking with you!</p>
        `,
        variables: ['firstName', 'date', 'time', 'meetingLink'],
      },
      call_summary: {
        name: 'call_summary',
        subject: 'Call Summary - {{firstName}} {{lastName}}',
        bodyHtml: `
          <h1>Call Summary</h1>
          <p><strong>Customer:</strong> {{firstName}} {{lastName}}</p>
          <p><strong>Phone:</strong> {{phoneNumber}}</p>
          <p><strong>Date:</strong> {{callDate}}</p>
          <p><strong>Duration:</strong> {{duration}} minutes</p>
          <h2>Summary</h2>
          <p>{{summary}}</p>
          <h2>Key Points</h2>
          <p>{{keyPoints}}</p>
          <h2>Next Steps</h2>
          <p>{{nextSteps}}</p>
        `,
        variables: ['firstName', 'lastName', 'phoneNumber', 'callDate', 'duration', 'summary', 'keyPoints', 'nextSteps'],
      },
      follow_up: {
        name: 'follow_up',
        subject: 'Following up on your inquiry',
        bodyHtml: `
          <h1>Hello {{firstName}},</h1>
          <p>I hope this email finds you well. I wanted to follow up on your interest in our {{program}}.</p>
          <p>Do you have any questions I can help answer?</p>
          <p>Best regards,<br>{{agentName}}<br>Heavenly Drops</p>
        `,
        variables: ['firstName', 'program', 'agentName'],
      },
    };

    const template = templates[templateName];
    if (!template) {
      return {
        success: false,
        error: `Template ${templateName} not found`,
      };
    }

    // Replace variables
    let bodyHtml = template.bodyHtml;
    let subject = template.subject;

    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      bodyHtml = bodyHtml.replace(regex, value);
      subject = subject.replace(regex, value);
    }

    return this.sendEmail({
      to,
      subject,
      bodyHtml,
    });
  }

  /**
   * Send call summary to team
   */
  async sendCallSummary(
    teamEmail: string,
    callData: {
      firstName: string;
      lastName: string;
      phoneNumber: string;
      callDate: string;
      duration: string;
      summary: string;
      keyPoints: string;
      nextSteps: string;
    },
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    return this.sendTemplateEmail(teamEmail, 'call_summary', callData);
  }

  /**
   * Send appointment confirmation
   */
  async sendAppointmentConfirmation(
    to: string,
    data: {
      firstName: string;
      date: string;
      time: string;
      meetingLink: string;
    },
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    return this.sendTemplateEmail(to, 'appointment_confirmation', data);
  }

  /**
   * Verify email configuration
   */
  async verifyConnection(): Promise<boolean> {
    try {
      if (!this.transporter) {
        await this.initializeTransporter();
      }
      await this.transporter.verify();
      return true;
    } catch (error) {
      this.logger.error('Email verification failed:', error.message);
      return false;
    }
  }
}
