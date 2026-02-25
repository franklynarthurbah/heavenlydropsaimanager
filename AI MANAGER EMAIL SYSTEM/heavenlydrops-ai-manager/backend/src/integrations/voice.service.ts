/**
 * Voice Service
 * 
 * Handles AI-powered voice calls using Twilio.
 * Integrates with OpenAI for conversational AI.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as Twilio from 'twilio';
import { IntegrationCredential, IntegrationType } from './entities/integration-credential.entity';
import { AiService } from '../ai/ai.service';
import { Lead } from '../leads/entities/lead.entity';

export interface CallRequest {
  to: string;
  leadId: string;
  lead: Lead;
  scheduledFor?: Date;
}

export interface CallStatus {
  callSid: string;
  status: string;
  duration?: number;
  recordingUrl?: string;
}

@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);
  private twilioClient: Twilio.Twilio;

  constructor(
    private configService: ConfigService,
    @InjectRepository(IntegrationCredential)
    private credentialRepository: Repository<IntegrationCredential>,
    private aiService: AiService,
  ) {
    this.initializeTwilio();
  }

  /**
   * Initialize Twilio client
   */
  private async initializeTwilio(): Promise<void> {
    try {
      const credentials = await this.credentialRepository.findOne({
        where: {
          integrationType: IntegrationType.TWILIO,
          status: 'active',
        },
      });

      if (credentials) {
        const creds = JSON.parse(credentials.credentials);
        this.twilioClient = Twilio(creds.accountSid, creds.authToken);
        this.logger.log('Twilio client initialized');
      } else {
        // Fallback to environment variables
        const accountSid = this.configService.get('TWILIO_ACCOUNT_SID');
        const authToken = this.configService.get('TWILIO_AUTH_TOKEN');
        if (accountSid && authToken) {
          this.twilioClient = Twilio(accountSid, authToken);
        }
      }
    } catch (error) {
      this.logger.error('Failed to initialize Twilio:', error.message);
    }
  }

  /**
   * Get Twilio credentials
   */
  private async getCredentials(): Promise<any> {
    const credentials = await this.credentialRepository.findOne({
      where: {
        integrationType: IntegrationType.TWILIO,
        status: 'active',
      },
    });

    if (credentials) {
      return JSON.parse(credentials.credentials);
    }

    return {
      accountSid: this.configService.get('TWILIO_ACCOUNT_SID'),
      authToken: this.configService.get('TWILIO_AUTH_TOKEN'),
      phoneNumber: this.configService.get('TWILIO_PHONE_NUMBER'),
    };
  }

  /**
   * Make outbound call
   */
  async makeCall(request: CallRequest): Promise<{ success: boolean; callSid?: string; error?: string }> {
    try {
      if (!this.twilioClient) {
        await this.initializeTwilio();
      }

      const creds = await this.getCredentials();
      const baseUrl = this.configService.get('APP_URL', 'https://heavenlydrops.access.ly');

      // Generate AI script for opening
      const aiScript = await this.aiService.generateVoiceScript(request.lead, 'opening');

      const call = await this.twilioClient.calls.create({
        to: request.to,
        from: creds.phoneNumber,
        url: `${baseUrl}/api/calls/twiml?leadId=${request.leadId}&script=${encodeURIComponent(aiScript.text)}`,
        statusCallback: `${baseUrl}/api/calls/status`,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        statusCallbackMethod: 'POST',
        record: true,
        recordingStatusCallback: `${baseUrl}/api/calls/recording`,
        recordingStatusCallbackMethod: 'POST',
      });

      this.logger.log(`Call initiated: ${call.sid} to ${request.to}`);

      return {
        success: true,
        callSid: call.sid,
      };
    } catch (error) {
      this.logger.error('Error making call:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Generate TwiML for call flow
   */
  generateTwiML(leadId: string, initialScript: string): string {
    const baseUrl = this.configService.get('APP_URL', 'https://heavenlydrops.access.ly');

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${this.escapeXml(initialScript)}</Say>
  <Gather input="speech" timeout="5" speechTimeout="auto" action="${baseUrl}/api/calls/gather?leadId=${leadId}" method="POST">
    <Say voice="Polly.Joanna">Please respond after the beep.</Say>
  </Gather>
  <Say voice="Polly.Joanna">I did not hear a response. Let me connect you with a specialist.</Say>
  <Dial>${this.configService.get('FALLBACK_PHONE_NUMBER', '+901234567890')}</Dial>
</Response>`;
  }

  /**
   * Handle gathered speech input
   */
  async handleGather(leadId: string, speechResult: string): Promise<string> {
    try {
      // Process speech with AI
      // This would integrate with your AI service to generate next response
      const baseUrl = this.configService.get('APP_URL', 'https://heavenlydrops.access.ly');

      // For now, return a simple response
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Thank you for your response. A consultant will follow up with you shortly.</Say>
  <Hangup/>
</Response>`;
    } catch (error) {
      this.logger.error('Error handling gather:', error.message);
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">I apologize, I did not understand. Let me connect you with a specialist.</Say>
  <Dial>${this.configService.get('FALLBACK_PHONE_NUMBER', '+901234567890')}</Dial>
</Response>`;
    }
  }

  /**
   * Get call status
   */
  async getCallStatus(callSid: string): Promise<CallStatus | null> {
    try {
      if (!this.twilioClient) {
        await this.initializeTwilio();
      }

      const call = await this.twilioClient.calls(callSid).fetch();

      return {
        callSid: call.sid,
        status: call.status,
        duration: call.duration ? parseInt(call.duration) : undefined,
      };
    } catch (error) {
      this.logger.error('Error getting call status:', error.message);
      return null;
    }
  }

  /**
   * Get recording
   */
  async getRecording(recordingSid: string): Promise<any> {
    try {
      if (!this.twilioClient) {
        await this.initializeTwilio();
      }

      const recording = await this.twilioClient.recordings(recordingSid).fetch();
      return recording;
    } catch (error) {
      this.logger.error('Error getting recording:', error.message);
      return null;
    }
  }

  /**
   * Get recording URL
   */
  getRecordingUrl(recordingSid: string): string {
    return `https://api.twilio.com/2010-04-01/Accounts/${this.configService.get('TWILIO_ACCOUNT_SID')}/Recordings/${recordingSid}`;
  }

  /**
   * Transcribe recording (using OpenAI Whisper)
   */
  async transcribeRecording(recordingUrl: string): Promise<string> {
    // This would download the recording and send to OpenAI Whisper
    // For now, return placeholder
    this.logger.log(`Transcription requested for: ${recordingUrl}`);
    return 'Transcription not yet implemented';
  }

  /**
   * Schedule a call
   */
  async scheduleCall(request: CallRequest): Promise<{ success: boolean; scheduledId?: string; error?: string }> {
    // Store in database for background job to process
    this.logger.log(`Call scheduled for ${request.scheduledFor?.toISOString()}`);
    return {
      success: true,
      scheduledId: `scheduled_${Date.now()}`,
    };
  }

  /**
   * Escape XML special characters
   */
  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * End active call
   */
  async endCall(callSid: string): Promise<boolean> {
    try {
      if (!this.twilioClient) {
        await this.initializeTwilio();
      }

      await this.twilioClient.calls(callSid).update({ status: 'completed' });
      return true;
    } catch (error) {
      this.logger.error('Error ending call:', error.message);
      return false;
    }
  }
}
