/**
 * Instagram Service
 * 
 * Integrates with Instagram Messaging API for DM automation.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IntegrationCredential, IntegrationType } from './entities/integration-credential.entity';

export interface InstagramMessage {
  recipientId: string;
  message: string;
}

export interface InstagramWebhookPayload {
  object: string;
  entry: {
    id: string;
    time: number;
    messaging: {
      sender: { id: string };
      recipient: { id: string };
      timestamp: number;
      message?: {
        mid: string;
        text: string;
        attachments?: any[];
      };
      postback?: {
        title: string;
        payload: string;
      };
    }[];
  }[];
}

@Injectable()
export class InstagramService {
  private readonly logger = new Logger(InstagramService.name);
  private apiUrl = 'https://graph.facebook.com/v18.0';

  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
    @InjectRepository(IntegrationCredential)
    private credentialRepository: Repository<IntegrationCredential>,
  ) {}

  /**
   * Get active Instagram credentials
   */
  private async getCredentials(): Promise<IntegrationCredential | null> {
    return this.credentialRepository.findOne({
      where: {
        integrationType: IntegrationType.INSTAGRAM,
        status: 'active',
      },
    });
  }

  /**
   * Send direct message
   */
  async sendMessage(message: InstagramMessage): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const credentials = await this.getCredentials();
      if (!credentials) {
        throw new Error('Instagram credentials not configured');
      }

      const creds = JSON.parse(credentials.credentials);
      const pageAccessToken = creds.pageAccessToken;
      const pageId = creds.pageId;

      const url = `${this.apiUrl}/me/messages`;

      const payload = {
        recipient: { id: message.recipientId },
        message: { text: message.message },
        access_token: pageAccessToken,
      };

      const response = await lastValueFrom(
        this.httpService.post(url, payload),
      );

      this.logger.log(`Instagram message sent to ${message.recipientId}`);

      return {
        success: true,
        messageId: response.data.message_id,
      };
    } catch (error) {
      this.logger.error('Error sending Instagram message:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Send message with quick replies
   */
  async sendMessageWithQuickReplies(
    recipientId: string,
    message: string,
    quickReplies: { title: string; payload: string }[],
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const credentials = await this.getCredentials();
      if (!credentials) {
        throw new Error('Instagram credentials not configured');
      }

      const creds = JSON.parse(credentials.credentials);
      const pageAccessToken = creds.pageAccessToken;

      const url = `${this.apiUrl}/me/messages`;

      const payload = {
        recipient: { id: recipientId },
        message: {
          text: message,
          quick_replies: quickReplies.map(qr => ({
            content_type: 'text',
            title: qr.title,
            payload: qr.payload,
          })),
        },
        access_token: pageAccessToken,
      };

      const response = await lastValueFrom(
        this.httpService.post(url, payload),
      );

      return {
        success: true,
        messageId: response.data.message_id,
      };
    } catch (error) {
      this.logger.error('Error sending Instagram message with quick replies:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Process incoming webhook
   */
  async processWebhook(payload: InstagramWebhookPayload): Promise<{
    messages: {
      senderId: string;
      text: string;
      timestamp: Date;
      messageId: string;
    }[];
  }> {
    const messages: any[] = [];

    for (const entry of payload.entry || []) {
      for (const messaging of entry.messaging || []) {
        if (messaging.message && messaging.message.text) {
          messages.push({
            senderId: messaging.sender.id,
            text: messaging.message.text,
            timestamp: new Date(messaging.timestamp),
            messageId: messaging.message.mid,
          });
        }

        // Handle postback (button clicks)
        if (messaging.postback) {
          messages.push({
            senderId: messaging.sender.id,
            text: `[POSTBACK: ${messaging.postback.payload}]`,
            timestamp: new Date(messaging.timestamp),
            messageId: `postback_${messaging.timestamp}`,
          });
        }
      }
    }

    return { messages };
  }

  /**
   * Get user profile
   */
  async getUserProfile(userId: string): Promise<any> {
    try {
      const credentials = await this.getCredentials();
      if (!credentials) {
        throw new Error('Instagram credentials not configured');
      }

      const creds = JSON.parse(credentials.credentials);
      const pageAccessToken = creds.pageAccessToken;

      const url = `${this.apiUrl}/${userId}?fields=name,profile_pic&access_token=${pageAccessToken}`;

      const response = await lastValueFrom(
        this.httpService.get(url),
      );

      return response.data;
    } catch (error) {
      this.logger.error('Error getting user profile:', error.message);
      return null;
    }
  }

  /**
   * Verify webhook
   */
  verifyWebhook(mode: string, token: string, challenge: string, verifyToken: string): string | false {
    if (mode === 'subscribe' && token === verifyToken) {
      return challenge;
    }
    return false;
  }
}
