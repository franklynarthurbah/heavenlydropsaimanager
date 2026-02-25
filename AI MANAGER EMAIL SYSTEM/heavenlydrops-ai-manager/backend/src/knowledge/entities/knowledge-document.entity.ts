/**
 * Knowledge Document Entity
 * 
 * Stores parsed content from external websites (Spain, Czech Republic, About Us pages)
 * for AI context retrieval.
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum DocumentType {
  STUDY_IN_SPAIN = 'study_in_spain',
  WORK_IN_CZECH = 'work_in_czech',
  ABOUT_COMPANY = 'about_company',
  FAQ = 'faq',
  GENERAL = 'general',
}

export enum DocumentStatus {
  ACTIVE = 'active',
  ARCHIVED = 'archived',
  PENDING_REVIEW = 'pending_review',
}

@Entity('knowledge_documents')
export class KnowledgeDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({
    type: 'enum',
    enum: DocumentType,
  })
  @Index()
  documentType: DocumentType;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'text', nullable: true })
  summary: string;

  @Column({ type: 'varchar', length: 500 })
  sourceUrl: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  sourceSection: string;

  @Column({
    type: 'enum',
    enum: DocumentStatus,
    default: DocumentStatus.ACTIVE,
  })
  status: DocumentStatus;

  @Column({ type: 'simple-json', nullable: true })
  keywords: string[];

  @Column({ type: 'simple-json', nullable: true })
  embeddings: number[];

  @Column({ type: 'int', default: 0 })
  usageCount: number;

  @Column({ type: 'timestamp', nullable: true })
  lastUsedAt: Date;

  @Column({ type: 'varchar', length: 64, nullable: true })
  contentHash: string;

  @Column({ type: 'timestamp' })
  fetchedAt: Date;

  @Column({ type: 'simple-json', nullable: true })
  metadata: {
    author: string;
    lastModified: string;
    wordCount: number;
    language: string;
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
