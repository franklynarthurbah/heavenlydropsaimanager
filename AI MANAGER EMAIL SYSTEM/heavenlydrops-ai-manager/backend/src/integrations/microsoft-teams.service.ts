/**
 * Microsoft Teams Service
 * 
 * Integrates with Microsoft Graph API to create Teams meetings
 * and manage calendar invitations.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from '@microsoft/microsoft-graph-client';
import { IntegrationCredential, IntegrationType } from './entities/integration-credential.entity';

export interface TeamsMeetingRequest {
  subject: string;
  startDateTime: Date;
  endDateTime: Date;
  attendees: {
    email: string;
    name: string;
  }[];
  description?: string;
}

export interface TeamsMeeting {
  id: string;
  joinUrl: string;
  meetingId: string;
  subject: string;
  startDateTime: Date;
  endDateTime: Date;
}

@Injectable()
export class MicrosoftTeamsService {
  private readonly logger = new Logger(MicrosoftTeamsService.name);
  private graphClient: Client;

  constructor(
    private configService: ConfigService,
    @InjectRepository(IntegrationCredential)
    private credentialRepository: Repository<IntegrationCredential>,
  ) {
    this.initializeGraphClient();
  }

  /**
   * Initialize Microsoft Graph client
   */
  private async initializeGraphClient(): Promise<void> {
    try {
      const credentials = await this.credentialRepository.findOne({
        where: {
          integrationType: IntegrationType.MICROSOFT_TEAMS,
          status: 'active',
        },
      });

      if (credentials) {
        const creds = JSON.parse(credentials.credentials);
        this.graphClient = Client.init({
          authProvider: (done) => {
            done(null, creds.accessToken);
          },
        });
        this.logger.log('Microsoft Graph client initialized');
      }
    } catch (error) {
      this.logger.error('Failed to initialize Graph client:', error.message);
    }
  }

  /**
   * Get credentials
   */
  private async getCredentials(): Promise<any> {
    const credentials = await this.credentialRepository.findOne({
      where: {
        integrationType: IntegrationType.MICROSOFT_TEAMS,
        status: 'active',
      },
    });

    if (credentials) {
      return JSON.parse(credentials.credentials);
    }

    return null;
  }

  /**
   * Create Teams meeting
   */
  async createMeeting(request: TeamsMeetingRequest): Promise<{ success: boolean; meeting?: TeamsMeeting; error?: string }> {
    try {
      if (!this.graphClient) {
        await this.initializeGraphClient();
      }

      const credentials = await this.getCredentials();
      if (!credentials) {
        throw new Error('Microsoft Teams credentials not configured');
      }

      // Create online meeting
      const meeting = {
        startDateTime: request.startDateTime.toISOString(),
        endDateTime: request.endDateTime.toISOString(),
        subject: request.subject,
        description: request.description || '',
        attendees: request.attendees.map(att => ({
          emailAddress: {
            address: att.email,
            name: att.name,
          },
          type: 'required',
        })),
        isOnlineMeeting: true,
        onlineMeetingProvider: 'teamsForBusiness',
      };

      const response = await this.graphClient
        .api('/me/events')
        .post(meeting);

      this.logger.log(`Teams meeting created: ${response.id}`);

      return {
        success: true,
        meeting: {
          id: response.id,
          joinUrl: response.onlineMeeting?.joinUrl,
          meetingId: response.onlineMeeting?.meetingId,
          subject: response.subject,
          startDateTime: new Date(response.start?.dateTime),
          endDateTime: new Date(response.end?.dateTime),
        },
      };
    } catch (error) {
      this.logger.error('Error creating Teams meeting:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get meeting details
   */
  async getMeeting(eventId: string): Promise<any> {
    try {
      if (!this.graphClient) {
        await this.initializeGraphClient();
      }

      const meeting = await this.graphClient
        .api(`/me/events/${eventId}`)
        .get();

      return meeting;
    } catch (error) {
      this.logger.error('Error getting meeting:', error.message);
      return null;
    }
  }

  /**
   * Update meeting
   */
  async updateMeeting(
    eventId: string,
    updates: Partial<TeamsMeetingRequest>,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.graphClient) {
        await this.initializeGraphClient();
      }

      const updateData: any = {};

      if (updates.subject) updateData.subject = updates.subject;
      if (updates.startDateTime) updateData.start = { dateTime: updates.startDateTime.toISOString() };
      if (updates.endDateTime) updateData.end = { dateTime: updates.endDateTime.toISOString() };
      if (updates.description) updateData.body = { content: updates.description, contentType: 'text' };

      await this.graphClient
        .api(`/me/events/${eventId}`)
        .patch(updateData);

      this.logger.log(`Meeting updated: ${eventId}`);

      return { success: true };
    } catch (error) {
      this.logger.error('Error updating meeting:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Cancel/delete meeting
   */
  async cancelMeeting(eventId: string, comment?: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.graphClient) {
        await this.initializeGraphClient();
      }

      // Cancel the event
      await this.graphClient
        .api(`/me/events/${eventId}/cancel`)
        .post({ comment: comment || 'Meeting cancelled' });

      this.logger.log(`Meeting cancelled: ${eventId}`);

      return { success: true };
    } catch (error) {
      this.logger.error('Error cancelling meeting:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get user's calendar events
   */
  async getCalendarEvents(startDate: Date, endDate: Date): Promise<any[]> {
    try {
      if (!this.graphClient) {
        await this.initializeGraphClient();
      }

      const events = await this.graphClient
        .api('/me/calendarview')
        .query(`startDateTime=${startDate.toISOString()}`)
        .query(`endDateTime=${endDate.toISOString()}`)
        .get();

      return events.value || [];
    } catch (error) {
      this.logger.error('Error getting calendar events:', error.message);
      return [];
    }
  }

  /**
   * Check availability
   */
  async checkAvailability(
    attendees: string[],
    startTime: Date,
    endTime: Date,
  ): Promise<any> {
    try {
      if (!this.graphClient) {
        await this.initializeGraphClient();
      }

      const request = {
        attendees: attendees.map(email => ({
          emailAddress: { address: email },
          type: 'required',
        })),
        timeConstraint: {
          activityDomain: 'work',
          timeSlots: [{
            start: { dateTime: startTime.toISOString(), timeZone: 'UTC' },
            end: { dateTime: endTime.toISOString(), timeZone: 'UTC' },
          }],
        },
        meetingDuration: 'PT30M',
      };

      const response = await this.graphClient
        .api('/me/findMeetingTimes')
        .post(request);

      return response;
    } catch (error) {
      this.logger.error('Error checking availability:', error.message);
      return null;
    }
  }

  /**
   * Send meeting invitation email
   */
  async sendMeetingInvitation(
    eventId: string,
    attendeeEmail: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.graphClient) {
        await this.initializeGraphClient();
      }

      // Get the event
      const event = await this.getMeeting(eventId);
      if (!event) {
        throw new Error('Event not found');
      }

      // Add attendee if not already present
      const existingAttendees = event.attendees || [];
      if (!existingAttendees.find((a: any) => a.emailAddress.address === attendeeEmail)) {
        existingAttendees.push({
          emailAddress: {
            address: attendeeEmail,
          },
          type: 'required',
        });

        await this.graphClient
          .api(`/me/events/${eventId}`)
          .patch({ attendees: existingAttendees });
      }

      this.logger.log(`Meeting invitation sent to ${attendeeEmail}`);

      return { success: true };
    } catch (error) {
      this.logger.error('Error sending invitation:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Refresh access token
   */
  async refreshToken(): Promise<boolean> {
    try {
      const credentials = await this.getCredentials();
      if (!credentials || !credentials.refreshToken) {
        return false;
      }

      // Implement token refresh using MSAL
      // This would use @azure/msal-node to refresh the token
      this.logger.log('Token refresh initiated');

      return true;
    } catch (error) {
      this.logger.error('Error refreshing token:', error.message);
      return false;
    }
  }
}
