/**
 * Appointments Service
 * 
 * Manages appointment scheduling with Microsoft Teams integration.
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { Appointment, AppointmentStatus, AppointmentType } from './entities/appointment.entity';
import { MicrosoftTeamsService } from '../integrations/microsoft-teams.service';
import { EmailService } from '../integrations/email.service';
import { LeadsService } from '../leads/leads.service';
import { ConfigService } from '@nestjs/config';
import { EmailType } from '../emails/entities/email-log.entity';

export interface CreateAppointmentRequest {
  leadId: string;
  scheduledAt: Date;
  durationMinutes?: number;
  type?: AppointmentType;
  notes?: string;
  attendees?: { email: string; name: string }[];
  assignedTo: string;
}

export interface RescheduleRequest {
  newScheduledAt: Date;
  reason?: string;
}

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    @InjectRepository(Appointment)
    private appointmentRepository: Repository<Appointment>,
    private teamsService: MicrosoftTeamsService,
    private emailService: EmailService,
    private leadsService: LeadsService,
    private configService: ConfigService,
  ) {}

  /**
   * Create new appointment with Teams meeting
   */
  async createAppointment(request: CreateAppointmentRequest): Promise<Appointment> {
    // Get lead details
    const lead = await this.leadsService.findOne(request.leadId);

    // Calculate end time
    const duration = request.durationMinutes || 30;
    const endTime = new Date(request.scheduledAt.getTime() + duration * 60000);

    // Create Teams meeting
    const teamsResult = await this.teamsService.createMeeting({
      subject: `Consultation - ${lead.firstName} ${lead.lastName}`,
      startDateTime: request.scheduledAt,
      endDateTime: endTime,
      attendees: [
        { email: lead.email, name: `${lead.firstName} ${lead.lastName}` },
        ...(request.attendees || []),
      ],
      description: request.notes || `Consultation appointment for ${lead.firstName} ${lead.lastName}`,
    });

    // Create appointment record
    const appointment = this.appointmentRepository.create({
      leadId: request.leadId,
      scheduledAt: request.scheduledAt,
      durationMinutes: duration,
      type: request.type || AppointmentType.CONSULTATION,
      notes: request.notes,
      assignedTo: request.assignedTo,
      timezone: 'UTC',
      teamsMeetingId: teamsResult.meeting?.meetingId,
      teamsJoinUrl: teamsResult.meeting?.joinUrl,
      teamsCalendarEventId: teamsResult.meeting?.id,
      teamsAttendees: teamsResult.meeting 
        ? [{ email: lead.email, name: `${lead.firstName} ${lead.lastName}`, response: 'pending' }]
        : [],
      status: AppointmentStatus.SCHEDULED,
      metadata: {
        createdBy: request.assignedTo,
        source: 'manual',
        rescheduleCount: 0,
      },
    });

    const savedAppointment = await this.appointmentRepository.save(appointment);

    // Send confirmation emails
    await this.sendConfirmationEmails(savedAppointment, lead);

    return savedAppointment;
  }

  /**
   * Send confirmation emails to customer and staff
   */
  private async sendConfirmationEmails(appointment: Appointment, lead: any): Promise<void> {
    const dateStr = appointment.scheduledAt.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const timeStr = appointment.scheduledAt.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });

    // Send to customer
    await this.emailService.sendAppointmentConfirmation(lead.email, {
      firstName: lead.firstName,
      date: dateStr,
      time: timeStr,
      meetingLink: appointment.teamsJoinUrl,
    });

    // Send to staff
    const staffEmail = this.configService.get('TEAM_EMAIL');
    if (staffEmail) {
      await this.emailService.sendEmail({
        to: staffEmail,
        subject: `New Appointment Scheduled - ${lead.firstName} ${lead.lastName}`,
        bodyHtml: `
          <h1>New Appointment</h1>
          <p><strong>Customer:</strong> ${lead.firstName} ${lead.lastName}</p>
          <p><strong>Date:</strong> ${dateStr}</p>
          <p><strong>Time:</strong> ${timeStr}</p>
          <p><strong>Meeting Link:</strong> <a href="${appointment.teamsJoinUrl}">Join Teams Meeting</a></p>
          <p><strong>Notes:</strong> ${appointment.notes || 'None'}</p>
        `,
        type: EmailType.APPOINTMENT_CONFIRMATION,
      });
    }
  }

  /**
   * Reschedule appointment
   */
  async rescheduleAppointment(
    id: string,
    request: RescheduleRequest,
  ): Promise<Appointment> {
    const appointment = await this.appointmentRepository.findOne({
      where: { id },
      relations: ['lead'],
    });

    if (!appointment) {
      throw new Error('Appointment not found');
    }

    // Update Teams meeting
    if (appointment.teamsCalendarEventId) {
      const duration = appointment.durationMinutes;
      const endTime = new Date(request.newScheduledAt.getTime() + duration * 60000);

      await this.teamsService.updateMeeting(appointment.teamsCalendarEventId, {
        startDateTime: request.newScheduledAt,
        endDateTime: endTime,
      });
    }

    // Update appointment
    appointment.scheduledAt = request.newScheduledAt;
    appointment.status = AppointmentStatus.RESCHEDULED;
    appointment.metadata = {
      ...appointment.metadata,
      rescheduleCount: (appointment.metadata?.rescheduleCount || 0) + 1,
      cancellationReason: request.reason,
    };

    return this.appointmentRepository.save(appointment);
  }

  /**
   * Cancel appointment
   */
  async cancelAppointment(id: string, reason?: string): Promise<Appointment> {
    const appointment = await this.appointmentRepository.findOne({
      where: { id },
      relations: ['lead'],
    });

    if (!appointment) {
      throw new Error('Appointment not found');
    }

    // Cancel Teams meeting
    if (appointment.teamsCalendarEventId) {
      await this.teamsService.cancelMeeting(appointment.teamsCalendarEventId, reason);
    }

    appointment.status = AppointmentStatus.CANCELLED;
    appointment.metadata = {
      ...appointment.metadata,
      cancellationReason: reason,
    };

    return this.appointmentRepository.save(appointment);
  }

  /**
   * Confirm appointment (customer confirmed)
   */
  async confirmAppointment(id: string, method: string): Promise<Appointment> {
    const appointment = await this.appointmentRepository.findOne({
      where: { id },
    });

    if (!appointment) {
      throw new Error('Appointment not found');
    }

    appointment.customerConfirmed = true;
    appointment.customerConfirmedAt = new Date();
    appointment.customerConfirmationMethod = method;
    appointment.status = AppointmentStatus.CONFIRMED;

    return this.appointmentRepository.save(appointment);
  }

  /**
   * Mark appointment as completed
   */
  async completeAppointment(id: string): Promise<Appointment> {
    const appointment = await this.appointmentRepository.findOne({
      where: { id },
    });

    if (!appointment) {
      throw new Error('Appointment not found');
    }

    appointment.status = AppointmentStatus.COMPLETED;

    return this.appointmentRepository.save(appointment);
  }

  /**
   * Get appointment by ID
   */
  async findOne(id: string): Promise<Appointment> {
    return this.appointmentRepository.findOne({
      where: { id },
      relations: ['lead'],
    });
  }

  /**
   * Get all appointments with filters
   */
  async findAll(filters: {
    leadId?: string;
    status?: AppointmentStatus;
    dateFrom?: Date;
    dateTo?: Date;
    assignedTo?: string;
  } = {}): Promise<Appointment[]> {
    const query = this.appointmentRepository.createQueryBuilder('appointment')
      .leftJoinAndSelect('appointment.lead', 'lead');

    if (filters.leadId) {
      query.andWhere('appointment.leadId = :leadId', { leadId: filters.leadId });
    }

    if (filters.status) {
      query.andWhere('appointment.status = :status', { status: filters.status });
    }

    if (filters.dateFrom) {
      query.andWhere('appointment.scheduledAt >= :dateFrom', { dateFrom: filters.dateFrom });
    }

    if (filters.dateTo) {
      query.andWhere('appointment.scheduledAt <= :dateTo', { dateTo: filters.dateTo });
    }

    if (filters.assignedTo) {
      query.andWhere('appointment.assignedTo = :assignedTo', { assignedTo: filters.assignedTo });
    }

    return query.orderBy('appointment.scheduledAt', 'ASC').getMany();
  }

  /**
   * Get upcoming appointments
   */
  async getUpcomingAppointments(hours: number = 24): Promise<Appointment[]> {
    const now = new Date();
    const future = new Date(now.getTime() + hours * 60 * 60 * 1000);

    return this.appointmentRepository.find({
      where: {
        scheduledAt: MoreThan(now),
        status: AppointmentStatus.SCHEDULED,
      },
      relations: ['lead'],
      order: { scheduledAt: 'ASC' },
    });
  }

  /**
   * Get appointment statistics
   */
  async getStatistics(): Promise<{
    total: number;
    byStatus: Record<string, number>;
    upcoming: number;
    completedThisMonth: number;
    cancelledThisMonth: number;
  }> {
    const total = await this.appointmentRepository.count();

    const byStatus = await this.appointmentRepository
      .createQueryBuilder('a')
      .select('a.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('a.status')
      .getRawMany();

    const now = new Date();
    const upcoming = await this.appointmentRepository.count({
      where: {
        scheduledAt: MoreThan(now),
        status: AppointmentStatus.SCHEDULED,
      },
    });

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const completedThisMonth = await this.appointmentRepository.count({
      where: {
        status: AppointmentStatus.COMPLETED,
        updatedAt: MoreThan(startOfMonth),
      },
    });

    const cancelledThisMonth = await this.appointmentRepository.count({
      where: {
        status: AppointmentStatus.CANCELLED,
        updatedAt: MoreThan(startOfMonth),
      },
    });

    return {
      total,
      byStatus: byStatus.reduce((acc, curr) => {
        acc[curr.status] = parseInt(curr.count);
        return acc;
      }, {}),
      upcoming,
      completedThisMonth,
      cancelledThisMonth,
    };
  }

  /**
   * Send reminder for upcoming appointment
   */
  async sendReminder(appointmentId: string): Promise<void> {
    const appointment = await this.findOne(appointmentId);
    if (!appointment || !appointment.lead) return;

    // Send reminder email
    await this.emailService.sendEmail({
      to: appointment.lead.email,
      subject: 'Reminder: Your Consultation is Coming Up',
      bodyHtml: `
        <h1>Appointment Reminder</h1>
        <p>Hi ${appointment.lead.firstName},</p>
        <p>This is a reminder that your consultation is scheduled for:</p>
        <p><strong>${appointment.scheduledAt.toLocaleString()}</strong></p>
        <p><a href="${appointment.teamsJoinUrl}">Join Teams Meeting</a></p>
        <p>We look forward to speaking with you!</p>
      `,
      type: EmailType.FOLLOW_UP,
    });

    // Update reminder log
    appointment.reminderLog = [
      ...(appointment.reminderLog || []),
      {
        type: 'email',
        sentAt: new Date().toISOString(),
        status: 'sent',
      },
    ];

    await this.appointmentRepository.save(appointment);
  }
}
