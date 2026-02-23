/**
 * Appointment Entity
 * 
 * Represents scheduled appointments with Microsoft Teams integration.
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Lead } from '../../leads/entities/lead.entity';

export enum AppointmentStatus {
  SCHEDULED = 'scheduled',
  CONFIRMED = 'confirmed',
  RESCHEDULED = 'rescheduled',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
  NO_SHOW = 'no_show',
}

export enum AppointmentType {
  CONSULTATION = 'consultation',
  FOLLOW_UP = 'follow_up',
  DOCUMENT_REVIEW = 'document_review',
  INTERVIEW_PREP = 'interview_prep',
  GENERAL = 'general',
}

@Entity('appointments')
export class Appointment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  leadId: string;

  @ManyToOne(() => Lead, (lead) => lead.appointments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'leadId' })
  lead: Lead;

  @Column({
    type: 'enum',
    enum: AppointmentStatus,
    default: AppointmentStatus.SCHEDULED,
  })
  status: AppointmentStatus;

  @Column({
    type: 'enum',
    enum: AppointmentType,
    default: AppointmentType.CONSULTATION,
  })
  type: AppointmentType;

  @Column({ type: 'timestamp' })
  scheduledAt: Date;

  @Column({ type: 'int', default: 30 })
  durationMinutes: number;

  @Column({ type: 'varchar', length: 100 })
  timezone: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'text', nullable: true })
  internalNotes: string;

  // Microsoft Teams Integration
  @Column({ type: 'varchar', length: 255, nullable: true })
  teamsMeetingId: string;

  @Column({ type: 'text', nullable: true })
  teamsJoinUrl: string;

  @Column({ type: 'text', nullable: true })
  teamsCalendarEventId: string;

  @Column({ type: 'simple-json', nullable: true })
  teamsAttendees: {
    email: string;
    name: string;
    response: string;
  }[];

  // Staff Assignment
  @Column({ type: 'uuid' })
  assignedTo: string;

  @Column({ type: 'simple-json', nullable: true })
  staffAttendees: string[];

  // Reminders
  @Column({ type: 'boolean', default: true })
  sendReminders: boolean;

  @Column({ type: 'simple-json', nullable: true })
  reminderLog: {
    type: string;
    sentAt: string;
    status: string;
  }[];

  // Customer Communication
  @Column({ type: 'boolean', default: false })
  customerConfirmed: boolean;

  @Column({ type: 'timestamp', nullable: true })
  customerConfirmedAt: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  customerConfirmationMethod: string;

  // AI Scheduling Data
  @Column({ type: 'simple-json', nullable: true })
  aiSchedulingData: {
    preferredTimes: string[];
    urgency: string;
    language: string;
    specialRequirements: string[];
  };

  @Column({ type: 'simple-json', nullable: true })
  metadata: {
    createdBy: string;
    source: string;
    rescheduleCount: number;
    cancellationReason: string;
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
