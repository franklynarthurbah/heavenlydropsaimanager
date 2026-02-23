/**
 * Email Log Entity
 * 
 * Tracks all emails sent and received through the system.
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum EmailDirection {
  INBOUND = 'inbound',
  OUTBOUND = 'outbound',
}

export enum EmailStatus {
  PENDING = 'pending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  OPENED = 'opened',
  CLICKED = 'clicked',
  BOUNCED = 'bounced',
  FAILED = 'failed',
  SPAM = 'spam',
}

export enum EmailType {
  AUTOMATED_REPLY = 'automated_reply',
  FOLLOW_UP = 'follow_up',
  APPOINTMENT_CONFIRMATION = 'appointment_confirmation',
  CALL_SUMMARY = 'call_summary',
  WELCOME = 'welcome',
  MARKETING = 'marketing',
  MANUAL = 'manual',
}

@Entity('email_logs')
export class EmailLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  leadId: string;

  @Column({
    type: 'enum',
    enum: EmailDirection,
  })
  direction: EmailDirection;

  @Column({
    type: 'enum',
    enum: EmailStatus,
    default: EmailStatus.PENDING,
  })
  status: EmailStatus;

  @Column({
    type: 'enum',
    enum: EmailType,
  })
  type: EmailType;

  @Column({ type: 'varchar', length: 255 })
  fromAddress: string;

  @Column({ type: 'varchar', length: 255 })
  toAddress: string;

  @Column({ type: 'varchar', length': 255, nullable: true })
  cc: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  bcc: string;

  @Column({ type: 'varchar', length: 500 })
  subject: string;

  @Column({ type: 'text' })
  bodyHtml: string;

  @Column({ type: 'text', nullable: true })
  bodyText: string;

  @Column({ type: 'simple-json', nullable: true })
  attachments: {
    filename: string;
    url: string;
    size: number;
  }[];

  @Column({ type: 'varchar', length: 255, nullable: true })
  externalMessageId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  threadId: string;

  @Column({ type: 'text', nullable: true })
  aiGeneratedContent: string;

  @Column({ type: 'boolean', default: false })
  aiApproved: boolean;

  @Column({ type: 'uuid', nullable: true })
  approvedBy: string;

  @Column({ type: 'timestamp', nullable: true })
  sentAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  openedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  clickedAt: Date;

  @Column({ type: 'simple-json', nullable: true })
  trackingData: {
    openCount: number;
    clickCount: number;
    ipAddress: string;
    userAgent: string;
  };

  @Column({ type: 'simple-json', nullable: true })
  metadata: {
    templateId: string;
    campaignId: string;
    tags: string[];
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
