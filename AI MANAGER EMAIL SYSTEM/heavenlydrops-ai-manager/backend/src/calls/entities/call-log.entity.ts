/**
 * Call Log Entity
 * 
 * Records AI voice calls made to leads.
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

export enum CallStatus {
  PENDING = 'pending',
  SCHEDULED = 'scheduled',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  NO_ANSWER = 'no_answer',
  BUSY = 'busy',
  VOICEMAIL = 'voicemail',
  CANCELLED = 'cancelled',
}

export enum CallDirection {
  OUTBOUND = 'outbound',
  INBOUND = 'inbound',
}

@Entity('call_logs')
export class CallLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  leadId: string;

  @ManyToOne(() => Lead, (lead) => lead.calls, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'leadId' })
  lead: Lead;

  @Column({
    type: 'enum',
    enum: CallDirection,
    default: CallDirection.OUTBOUND,
  })
  direction: CallDirection;

  @Column({
    type: 'enum',
    enum: CallStatus,
    default: CallStatus.SCHEDULED,
  })
  status: CallStatus;

  @Column({ type: 'varchar', length: 50 })
  phoneNumber: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  externalCallId: string;

  @Column({ type: 'int', nullable: true })
  durationSeconds: number;

  @Column({ type: 'text', nullable: true })
  transcript: string;

  @Column({ type: 'text', nullable: true })
  aiSummary: string;

  @Column({ type: 'simple-json', nullable: true })
  aiExtractedData: {
    qualificationAnswers: Record<string, string>;
    interestLevel: string;
    objections: string[];
    nextSteps: string;
  };

  @Column({ type: 'simple-json', nullable: true })
  recordingUrls: {
    full: string;
    segments: string[];
  };

  @Column({ type: 'simple-json', nullable: true })
  conversationFlow: {
    question: string;
    response: string;
    timestamp: string;
  }[];

  @Column({ type: 'timestamp', nullable: true })
  startedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  endedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  scheduledFor: Date;

  @Column({ type: 'int', default: 0 })
  retryCount: number;

  @Column({ type: 'text', nullable: true })
  errorMessage: string;

  @Column({ type: 'simple-json', nullable: true })
  metadata: {
    provider: string;
    cost: number;
    voiceId: string;
    language: string;
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
