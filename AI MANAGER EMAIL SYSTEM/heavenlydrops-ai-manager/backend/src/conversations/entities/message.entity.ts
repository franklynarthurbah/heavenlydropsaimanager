/**
 * Message Entity
 * 
 * Represents individual messages within a conversation.
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Conversation } from './conversation.entity';

export enum MessageSender {
  LEAD = 'lead',
  AI = 'ai',
  HUMAN_AGENT = 'human_agent',
  SYSTEM = 'system',
}

export enum MessageStatus {
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
  FAILED = 'failed',
  PENDING = 'pending',
}

@Entity('messages')
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  conversationId: string;

  @ManyToOne(() => Conversation, (conversation) => conversation.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversationId' })
  conversation: Conversation;

  @Column({
    type: 'enum',
    enum: MessageSender,
  })
  sender: MessageSender;

  @Column({ type: 'uuid', nullable: true })
  senderId: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'simple-json', nullable: true })
  attachments: {
    url: string;
    type: string;
    filename: string;
  }[];

  @Column({
    type: 'enum',
    enum: MessageStatus,
    default: MessageStatus.PENDING,
  })
  status: MessageStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  externalMessageId: string;

  @Column({ type: 'text', nullable: true })
  aiPrompt: string;

  @Column({ type: 'text', nullable: true })
  aiResponseRaw: string;

  @Column({ type: 'simple-json', nullable: true })
  aiMetadata: {
    model: string;
    tokensUsed: number;
    confidence: number;
    intent: string;
  };

  @Column({ type: 'timestamp', nullable: true })
  deliveredAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  readAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
