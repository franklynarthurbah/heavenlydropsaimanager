/**
 * Conversation Entity
 * 
 * Represents a conversation thread with a lead across
 * different channels (WhatsApp, Instagram, Email).
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { Lead } from '../../leads/entities/lead.entity';
import { Message } from './message.entity';

export enum ConversationChannel {
  WHATSAPP = 'whatsapp',
  INSTAGRAM = 'instagram',
  EMAIL = 'email',
  WEB_CHAT = 'web_chat',
}

export enum ConversationStatus {
  ACTIVE = 'active',
  PENDING = 'pending',
  RESOLVED = 'resolved',
  ARCHIVED = 'archived',
}

@Entity('conversations')
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  leadId: string;

  @ManyToOne(() => Lead, (lead) => lead.conversations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'leadId' })
  lead: Lead;

  @Column({
    type: 'enum',
    enum: ConversationChannel,
  })
  channel: ConversationChannel;

  @Column({
    type: 'enum',
    enum: ConversationStatus,
    default: ConversationStatus.ACTIVE,
  })
  status: ConversationStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  externalId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  externalThreadId: string;

  @Column({ type: 'text', nullable: true })
  aiSummary: string;

  @Column({ type: 'simple-json', nullable: true })
  aiTags: string[];

  @Column({ type: 'int', default: 0 })
  messageCount: number;

  @Column({ type: 'timestamp', nullable: true })
  lastMessageAt: Date;

  @Column({ type: 'uuid', nullable: true })
  assignedTo: string;

  @Column({ type: 'boolean', default: false })
  requiresHumanAttention: boolean;

  @Column({ type: 'simple-json', nullable: true })
  context: {
    topic: string;
    qualificationScore: number;
    nextAction: string;
  };

  @OneToMany(() => Message, (message) => message.conversation)
  messages: Message[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
