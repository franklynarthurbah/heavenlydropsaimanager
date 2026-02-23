/**
 * Lead Entity
 * 
 * Represents potential customers who have shown interest
 * in Heavenly Drops services through various channels.
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { Conversation } from '../../conversations/entities/conversation.entity';
import { CallLog } from '../../calls/entities/call-log.entity';
import { Appointment } from '../../appointments/entities/appointment.entity';

export enum LeadStatus {
  NEW = 'new',
  CONTACTED = 'contacted',
  QUALIFIED = 'qualified',
  UNQUALIFIED = 'unqualified',
  APPOINTMENT_SCHEDULED = 'appointment_scheduled',
  CONVERTED = 'converted',
  LOST = 'lost',
  FOLLOW_UP = 'follow_up',
}

export enum LeadSource {
  WEBSITE_FORM = 'website_form',
  WHATSAPP = 'whatsapp',
  INSTAGRAM = 'instagram',
  FACEBOOK = 'facebook',
  REFERRAL = 'referral',
  EMAIL = 'email',
  PHONE = 'phone',
  WALK_IN = 'walk_in',
  OTHER = 'other',
}

export enum InterestType {
  STUDY_IN_SPAIN = 'study_in_spain',
  WORK_IN_CZECH = 'work_in_czech',
  OTHER = 'other',
}

@Entity('leads')
export class Lead {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  firstName: string;

  @Column({ type: 'varchar', length: 100 })
  lastName: string;

  @Column({ type: 'varchar', length: 255 })
  @Index()
  email: string;

  @Column({ type: 'varchar', length: 20 })
  @Index()
  phoneNumber: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  country: string;

  @Column({ type: 'int', nullable: true })
  age: number;

  @Column({
    type: 'enum',
    enum: InterestType,
    default: InterestType.OTHER,
  })
  interestType: InterestType;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({
    type: 'enum',
    enum: LeadStatus,
    default: LeadStatus.NEW,
  })
  @Index()
  status: LeadStatus;

  @Column({
    type: 'enum',
    enum: LeadSource,
    default: LeadSource.WEBSITE_FORM,
  })
  source: LeadSource;

  @Column({ type: 'varchar', length: 255, nullable: true })
  referralCode: string;

  @Column({ type: 'simple-json', nullable: true })
  qualificationData: {
    hasPassport: boolean;
    englishLevel: string;
    budget: string;
    timeline: string;
    previousExperience: string;
  };

  @Column({ type: 'int', default: 0 })
  aiInteractionCount: number;

  @Column({ type: 'timestamp', nullable: true })
  lastContactedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  nextFollowUpAt: Date;

  @Column({ type: 'uuid', nullable: true })
  assignedTo: string;

  @Column({ type: 'simple-json', nullable: true })
  metadata: {
    ipAddress: string;
    userAgent: string;
    utmSource: string;
    utmMedium: string;
    utmCampaign: string;
  };

  @OneToMany(() => Conversation, (conversation) => conversation.lead)
  conversations: Conversation[];

  @OneToMany(() => CallLog, (callLog) => callLog.lead)
  calls: CallLog[];

  @OneToMany(() => Appointment, (appointment) => appointment.lead)
  appointments: Appointment[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
