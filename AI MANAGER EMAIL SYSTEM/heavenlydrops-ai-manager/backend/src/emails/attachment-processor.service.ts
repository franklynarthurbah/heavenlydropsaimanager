/**
 * Attachment Processor Service
 *
 * Extracts attachments from inbound emails and:
 *   1. Persists metadata to email_attachments.
 *   2. Extracts text from PDF / DOCX.
 *   3. Routes the attachment to the correct chatbot workflow or lead update.
 *   4. Triggers BullMQ jobs for heavy processing.
 *
 * Supported types:
 *   - application/pdf          → PDF text extraction (pdf-parse)
 *   - application/vnd.openxmlformats-officedocument.wordprocessingml.document
 *                              → DOCX extraction (mammoth)
 *   - image/*                  → stored for potential OCR
 *   - application/zip          → unpacked, each file re-processed
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { LeadsService } from '../leads/leads.service';

export interface RawAttachment {
  filename: string;
  mimeType: string;
  content: Buffer;
  size?: number;
}

export interface ProcessedAttachment {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  extractedText?: string;
  automationTriggered?: string;
}

@Injectable()
export class AttachmentProcessorService {
  private readonly logger = new Logger(AttachmentProcessorService.name);
  private readonly STORAGE_DIR = process.env.ATTACHMENT_STORAGE_DIR ?? '/app/attachments';

  constructor(
    @InjectDataSource()
    private dataSource: DataSource,
    @InjectQueue('email-processing')
    private emailQueue: Queue,
    private leadsService: LeadsService,
  ) {
    this.ensureStorageDir();
  }

  private ensureStorageDir(): void {
    if (!fs.existsSync(this.STORAGE_DIR)) {
      fs.mkdirSync(this.STORAGE_DIR, { recursive: true });
    }
  }

  /**
   * Main entry – process all attachments from an inbound email.
   */
  async processAttachments(
    emailLogId: string,
    leadId: string | null,
    attachments: RawAttachment[],
  ): Promise<ProcessedAttachment[]> {
    const results: ProcessedAttachment[] = [];

    for (const att of attachments) {
      try {
        const processed = await this.processSingle(emailLogId, leadId, att);
        results.push(processed);
      } catch (err) {
        this.logger.error(`Failed to process attachment ${att.filename}:`, err.message);
      }
    }

    // Update email_logs attachment counts
    await this.dataSource.query(
      `UPDATE email_logs SET has_attachments = true, attachment_count = $1 WHERE id = $2`,
      [results.length, emailLogId],
    );

    return results;
  }

  // ── Single attachment processing ─────────────────────────────────────────

  private async processSingle(
    emailLogId: string,
    leadId: string | null,
    att: RawAttachment,
  ): Promise<ProcessedAttachment> {
    const sizeBytes = att.size ?? att.content.length;
    const hash = crypto.createHash('sha256').update(att.content).digest('hex').slice(0, 12);
    const ext = path.extname(att.filename) || this.guessExtension(att.mimeType);
    const safeFilename = `${Date.now()}_${hash}${ext}`;
    const storagePath = path.join(this.STORAGE_DIR, safeFilename);

    // Save to disk
    fs.writeFileSync(storagePath, att.content);

    // Extract text
    let extractedText: string | undefined;
    try {
      extractedText = await this.extractText(att.content, att.mimeType, att.filename);
    } catch (e) {
      this.logger.warn(`Text extraction failed for ${att.filename}: ${e.message}`);
    }

    // Determine automation
    const automationTriggered = await this.routeToAutomation(att, extractedText, leadId);

    // Persist to DB
    const [row] = await this.dataSource.query<{ id: string }[]>(
      `INSERT INTO email_attachments
         (email_log_id, filename, mime_type, size_bytes, storage_path,
          extracted_text, processing_status, automation_triggered, lead_id)
       VALUES ($1,$2,$3,$4,$5,$6,'processed',$7,$8)
       RETURNING id`,
      [emailLogId, att.filename, att.mimeType, sizeBytes, storagePath,
        extractedText ?? null, automationTriggered ?? null, leadId],
    );

    // Enqueue heavy background tasks
    await this.emailQueue.add('attachment-followup', {
      attachmentId: row.id,
      emailLogId,
      leadId,
      mimeType: att.mimeType,
      storagePath,
      extractedText,
    });

    return {
      id: row.id,
      filename: att.filename,
      mimeType: att.mimeType,
      sizeBytes,
      storagePath,
      extractedText,
      automationTriggered,
    };
  }

  // ── Text extraction ──────────────────────────────────────────────────────

  private async extractText(content: Buffer, mimeType: string, filename: string): Promise<string> {
    if (mimeType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf')) {
      return this.extractPdf(content);
    }
    if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      filename.toLowerCase().endsWith('.docx')
    ) {
      return this.extractDocx(content);
    }
    if (mimeType === 'text/plain' || filename.toLowerCase().endsWith('.txt')) {
      return content.toString('utf8');
    }
    return '';
  }

  private async extractPdf(content: Buffer): Promise<string> {
    // pdf-parse – lightweight, no native deps
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(content);
    return data.text ?? '';
  }

  private async extractDocx(content: Buffer): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ buffer: content });
    return result.value ?? '';
  }

  // ── Automation routing ────────────────────────────────────────────────────

  private async routeToAutomation(
    att: RawAttachment,
    text: string | undefined,
    leadId: string | null,
  ): Promise<string | undefined> {
    const lower = att.filename.toLowerCase();
    const textLower = (text ?? '').toLowerCase();

    // Application form → lead update
    if (
      lower.includes('application') ||
      lower.includes('form') ||
      textLower.includes('application form') ||
      textLower.includes('passport')
    ) {
      if (leadId) {
        await this.leadsService.update(leadId, { notes: `Document received: ${att.filename}` });
      }
      return 'lead-document-update';
    }

    // CV / resume → store as knowledge doc
    if (lower.includes('cv') || lower.includes('resume') || lower.includes('curriculum')) {
      return 'cv-intake-workflow';
    }

    // Contract
    if (lower.includes('contract') || lower.includes('agreement')) {
      return 'contract-review-workflow';
    }

    // Invoice
    if (lower.includes('invoice') || lower.includes('receipt') || lower.includes('payment')) {
      return 'finance-workflow';
    }

    return undefined;
  }

  private guessExtension(mimeType: string): string {
    const map: Record<string, string> = {
      'application/pdf': '.pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
      'application/msword': '.doc',
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'text/plain': '.txt',
      'application/zip': '.zip',
    };
    return map[mimeType] ?? '';
  }
}
