/**
 * Integration Credential Entity
 * 
 * Stores API keys and credentials for external services.
 * In production, sensitive values should be encrypted.
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum IntegrationType {
  WHATSAPP = 'whatsapp',
  INSTAGRAM = 'instagram',
  TWILIO = 'twilio',
  SENDGRID = 'sendgrid',
  SMTP = 'smtp',
  MICROSOFT_TEAMS = 'microsoft_teams',
  OPENAI = 'openai',
}

export enum CredentialStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  REVOKED = 'revoked',
  ERROR = 'error',
}

@Entity('integration_credentials')
export class IntegrationCredential {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: IntegrationType,
  })
  @Index()
  integrationType: IntegrationType;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'text' })
  credentials: string;

  @Column({
    type: 'enum',
    enum: CredentialStatus,
    default: CredentialStatus.ACTIVE,
  })
  status: CredentialStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  webhookUrl: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  webhookSecret: string;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastUsedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastErrorAt: Date;

  @Column({ type: 'text', nullable: true })
  lastErrorMessage: string;

  @Column({ type: 'simple-json', nullable: true })
  rateLimits: {
    requestsPerMinute: number;
    requestsPerDay: number;
    currentUsage: number;
  };

  @Column({ type: 'simple-json', nullable: true })
  metadata: {
    accountId: string;
    phoneNumber: string;
    region: string;
  };

  @Column({ type: 'boolean', default: true })
  isDefault: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
