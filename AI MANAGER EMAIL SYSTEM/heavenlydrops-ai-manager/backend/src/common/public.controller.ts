/**
 * Public Controller
 * 
 * Public endpoints that don't require authentication:
 * - Lead form submission
 * - Webhook handlers for WhatsApp, Instagram
 * - Health check
 */

import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  Query,
  HttpCode,
  HttpStatus,
  Ip,
  BadRequestException,
} from '@nestjs/common';
import {
  IsString,
  IsEmail,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsIn,
  IsNotEmpty,
  Matches,
} from 'class-validator';
import { LeadsService } from '../leads/leads.service';
import { ConversationsService, IncomingMessage } from '../conversations/conversations.service';
import { WhatsAppService, WhatsAppWebhookPayload } from '../integrations/whatsapp.service';
import { InstagramService, InstagramWebhookPayload } from '../integrations/instagram.service';
import { JobsService } from '../jobs/jobs.service';
import { InterestType } from '../leads/entities/lead.entity';

export class SubmitLeadDto {
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\+?[1-9]\d{6,14}$/, { message: 'phoneNumber must be a valid international phone number' })
  phoneNumber: string;

  @IsIn(['study_in_spain', 'work_in_czech', 'other'])
  interestType: string;

  @IsString()
  @IsOptional()
  country?: string;

  @IsInt()
  @Min(16)
  @Max(80)
  @IsOptional()
  age?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}

@Controller()
export class PublicController {
  constructor(
    private leadsService: LeadsService,
    private conversationsService: ConversationsService,
    private whatsappService: WhatsAppService,
    private instagramService: InstagramService,
    private jobsService: JobsService,
  ) {}

  /**
   * Health check endpoint
   */
  @Get('health')
  healthCheck() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'heavenlydrops-ai-manager',
    };
  }

  /**
   * Public lead form submission
   * POST /api/leads/public
   */
  @Post('api/leads/public')
  @HttpCode(HttpStatus.CREATED)
  async submitLead(
    @Body() data: SubmitLeadDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ) {
    // Create lead
    const lead = await this.leadsService.createFromForm({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phoneNumber: data.phoneNumber,
      interestType: data.interestType,
      country: data.country,
      age: data.age,
      notes: data.notes,
      ipAddress: ip,
      userAgent: userAgent,
    });

    // Trigger welcome email
    await this.jobsService.scheduleEmail({
      to: data.email,
      templateName: 'welcome',
      variables: {
        firstName: data.firstName,
        program: data.interestType === 'study_in_spain' ? 'Study in Spain' : 
                 data.interestType === 'work_in_czech' ? 'Work in Czech Republic' : 'Our Programs',
      },
      leadId: lead.id,
    }, 5000); // Send after 5 seconds

    // Schedule AI voice call (after 10 minutes)
    await this.jobsService.scheduleCall({
      callId: `call_${lead.id}`,
      leadId: lead.id,
      phoneNumber: data.phoneNumber,
    }, 10 * 60 * 1000);

    return {
      success: true,
      message: 'Thank you for your interest! We will contact you shortly.',
      leadId: lead.id,
    };
  }

  /**
   * WhatsApp webhook verification
   * GET /api/webhooks/whatsapp
   */
  @Get('api/webhooks/whatsapp')
  verifyWhatsAppWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'your-verify-token';
    
    if (mode === 'subscribe' && token === verifyToken) {
      return challenge;
    }
    
    return 'Verification failed';
  }

  /**
   * WhatsApp webhook handler
   * POST /api/webhooks/whatsapp
   */
  @Post('api/webhooks/whatsapp')
  @HttpCode(HttpStatus.OK)
  async handleWhatsAppWebhook(
    @Body() payload: WhatsAppWebhookPayload,
    @Headers('x-hub-signature-256') signature: string,
  ) {
    try {
      // Validate webhook signature before processing
      const appSecret = process.env.WHATSAPP_APP_SECRET;
      if (appSecret && signature) {
        const rawSig = signature.startsWith('sha256=') ? signature.slice(7) : signature;
        const isValid = this.whatsappService.verifyWebhookSignature(
          rawSig,
          JSON.stringify(payload),
          appSecret,
        );
        if (!isValid) {
          throw new BadRequestException('Invalid webhook signature');
        }
      }

      // Process webhook
      const { messages } = await this.whatsappService.processWebhook(payload);

      for (const message of messages) {
        // Handle each message
        await this.conversationsService.handleIncomingMessage({
          channel: 'whatsapp',
          externalId: message.messageId,
          senderId: message.from,
          senderName: message.senderName,
          content: message.text,
          timestamp: message.timestamp,
        });
      }

      return { success: true };
    } catch (error) {
      console.error('WhatsApp webhook error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Instagram webhook verification
   * GET /api/webhooks/instagram
   */
  @Get('api/webhooks/instagram')
  verifyInstagramWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    const verifyToken = process.env.INSTAGRAM_VERIFY_TOKEN || 'your-verify-token';
    
    if (mode === 'subscribe' && token === verifyToken) {
      return challenge;
    }
    
    return 'Verification failed';
  }

  /**
   * Instagram webhook handler
   * POST /api/webhooks/instagram
   */
  @Post('api/webhooks/instagram')
  @HttpCode(HttpStatus.OK)
  async handleInstagramWebhook(
    @Body() payload: InstagramWebhookPayload,
  ) {
    try {
      // Process webhook
      const { messages } = await this.instagramService.processWebhook(payload);

      for (const message of messages) {
        // Get user profile
        const profile = await this.instagramService.getUserProfile(message.senderId);

        // Handle each message
        await this.conversationsService.handleIncomingMessage({
          channel: 'instagram',
          externalId: message.messageId,
          senderId: message.senderId,
          senderName: profile?.name || 'Instagram User',
          content: message.text,
          timestamp: message.timestamp,
        });
      }

      return { success: true };
    } catch (error) {
      console.error('Instagram webhook error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Email webhook handler (for receiving emails)
   * POST /api/webhooks/email
   */
  @Post('api/webhooks/email')
  @HttpCode(HttpStatus.OK)
  async handleEmailWebhook(@Body() payload: any) {
    try {
      // Process incoming email
      // This would integrate with your email provider's webhook
      console.log('Email webhook received:', payload);
      
      return { success: true };
    } catch (error) {
      console.error('Email webhook error:', error);
      return { success: false, error: error.message };
    }
  }
}
