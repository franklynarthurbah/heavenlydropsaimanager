/**
 * WhatsApp Service
 * 
 * Integrates with WhatsApp Business API for sending and receiving messages.
 * Uses Meta's Cloud API for production use.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { IntegrationCredential, IntegrationType } from './entities/integration-credential.entity';

export interface WhatsAppMessage {
  to: string;
  body: string;
  mediaUrl?: string;
}

export interface WhatsAppWebhookPayload {
  object: string;
  entry: {
    id: string;
    changes: {
      value: {
        messaging_product: string;
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        contacts?: {
          profile: { name: string };
          wa_id: string;
        }[];
        messages?: {
          from: string;
          id: string;
          timestamp: string;
          text?: { body: string };
          type: string;
        }[];
        statuses?: any[];
      };
      field: string;
    }[];
  }[];
}

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private apiUrl = 'https://graph.facebook.com/v21.0';

  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
    @InjectRepository(IntegrationCredential)
    private credentialRepository: Repository<IntegrationCredential>,
  ) {}

  /**
   * Get active WhatsApp credentials
   */
  private async getCredentials(): Promise<IntegrationCredential | null> {
    return this.credentialRepository.findOne({
      where: {
        integrationType: IntegrationType.WHATSAPP,
        status: 'active',
      },
    });
  }

  /**
   * Send text message
   */
  async sendMessage(message: WhatsAppMessage): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const credentials = await this.getCredentials();
      if (!credentials) {
        throw new Error('WhatsApp credentials not configured');
      }

      const creds = JSON.parse(credentials.credentials);
      const phoneNumberId = creds.phoneNumberId;
      const accessToken = creds.accessToken;

      const url = `${this.apiUrl}/${phoneNumberId}/messages`;

      const payload: any = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: this.formatPhoneNumber(message.to),
        type: 'text',
        text: { body: message.body },
      };

      const response = await lastValueFrom(
        this.httpService.post(url, payload, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }),
      );

      this.logger.log(`WhatsApp message sent to ${message.to}`);

      return {
        success: true,
        messageId: response.data.messages?.[0]?.id,
      };
    } catch (error) {
      this.logger.error('Error sending WhatsApp message:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Send template message
   */
  async sendTemplateMessage(
    to: string,
    templateName: string,
    languageCode: string = 'en',
    components?: any[],
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const credentials = await this.getCredentials();
      if (!credentials) {
        throw new Error('WhatsApp credentials not configured');
      }

      const creds = JSON.parse(credentials.credentials);
      const phoneNumberId = creds.phoneNumberId;
      const accessToken = creds.accessToken;

      const url = `${this.apiUrl}/${phoneNumberId}/messages`;

      const payload: any = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: this.formatPhoneNumber(to),
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode },
        },
      };

      if (components) {
        payload.template.components = components;
      }

      const response = await lastValueFrom(
        this.httpService.post(url, payload, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }),
      );

      this.logger.log(`WhatsApp template sent to ${to}`);

      return {
        success: true,
        messageId: response.data.messages?.[0]?.id,
      };
    } catch (error) {
      this.logger.error('Error sending WhatsApp template:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Process incoming webhook
   */
  async processWebhook(payload: WhatsAppWebhookPayload): Promise<{
    messages: {
      from: string;
      text: string;
      timestamp: Date;
      messageId: string;
      senderName: string;
    }[];
  }> {
    const messages: any[] = [];

    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value;

        if (value.messages) {
          for (const message of value.messages) {
            if (message.type === 'text' && message.text) {
              const contact = value.contacts?.[0];
              messages.push({
                from: message.from,
                text: message.text.body,
                timestamp: new Date(parseInt(message.timestamp) * 1000),
                messageId: message.id,
                senderName: contact?.profile?.name || 'Unknown',
              });
            }
          }
        }
      }
    }

    return { messages };
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(
    signature: string,
    body: string,
    appSecret: string,
  ): boolean {
    // Implement signature verification using crypto
    const expectedSignature = crypto
      .createHmac('sha256', appSecret)
      .update(body, 'utf8')
      .digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature),
    );
  }

  /**
   * Format phone number for WhatsApp API
   */
  private formatPhoneNumber(phone: string): string {
    // Remove non-numeric characters
    let cleaned = phone.replace(/\D/g, '');
    
    // Ensure it starts with country code
    if (!cleaned.startsWith('9') && cleaned.length === 10) {
      cleaned = '90' + cleaned; // Default to Turkey
    }
    
    return cleaned;
  }

  /**
   * Get message status
   */
  async getMessageStatus(messageId: string): Promise<any> {
    try {
      const credentials = await this.getCredentials();
      if (!credentials) {
        throw new Error('WhatsApp credentials not configured');
      }

      const creds = JSON.parse(credentials.credentials);
      const accessToken = creds.accessToken;

      const url = `${this.apiUrl}/${messageId}`;

      const response = await lastValueFrom(
        this.httpService.get(url, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }),
      );

      return response.data;
    } catch (error) {
      this.logger.error('Error getting message status:', error.message);
      return null;
    }
  }
}
