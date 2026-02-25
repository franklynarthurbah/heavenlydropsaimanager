/**
 * Email Inbox Poller Service
 *
 * Polls the company Gmail/IMAP inbox for new messages on a schedule.
 * For each incoming email it:
 *   1. Classifies the inquiry as "study_in_spain" | "work_in_czech" | "other"
 *   2. Creates or matches a Lead record
 *   3. Hands off to EmailsService which generates an AI reply
 *
 * Supports two backends:
 *  - Gmail API (OAuth2 — recommended for production)
 *  - IMAP (any mail provider, configured via env vars)
 *
 * Environment variables required for IMAP mode:
 *   IMAP_HOST, IMAP_PORT, IMAP_USER, IMAP_PASS, IMAP_TLS=true|false
 *
 * Environment variables required for Gmail API mode:
 *   GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_USER
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EmailsService, IncomingEmail } from './emails.service';
import { LeadsService } from '../leads/leads.service';
import { AiService } from '../ai/ai.service';
import { InterestType } from '../leads/entities/lead.entity';

// We use imap-simple (lightweight IMAP client). Add to package.json:
// "imap-simple": "^5.1.0", "@types/imap-simple": "^4.2.3", "mailparser": "^3.6.5"
// For Gmail API: "googleapis": "^140.0.0"

export interface ParsedEmail {
  from: string;
  fromName: string;
  to: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  messageId: string;
  threadId?: string;
  receivedAt: Date;
}

export interface ClassificationResult {
  interestType: InterestType;
  confidence: number;
  extractedName?: string;
  extractedPhone?: string;
  extractedCountry?: string;
  summary: string;
}

@Injectable()
export class EmailInboxService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailInboxService.name);
  private isPolling = false;
  private processedMessageIds = new Set<string>(); // In-memory dedup (use Redis in prod)

  constructor(
    private configService: ConfigService,
    private emailsService: EmailsService,
    private leadsService: LeadsService,
    private aiService: AiService,
  ) {}

  onModuleInit() {
    this.logger.log('EmailInboxService initialized — inbox polling ready');
  }

  onModuleDestroy() {
    this.logger.log('EmailInboxService shutting down');
  }

  // ─── Scheduled Poll — every 5 minutes ─────────────────────────────────────

  @Cron('*/5 * * * *', { name: 'email-inbox-poll' })
  async pollInbox(): Promise<void> {
    if (this.isPolling) {
      this.logger.debug('Previous poll still running — skipping');
      return;
    }

    this.isPolling = true;
    try {
      const mode = this.configService.get<string>('EMAIL_POLL_MODE', 'imap');

      if (mode === 'gmail') {
        await this.pollGmailInbox();
      } else {
        await this.pollImapInbox();
      }
    } catch (error) {
      this.logger.error('Inbox poll error:', error.message);
    } finally {
      this.isPolling = false;
    }
  }

  // ─── IMAP Polling ─────────────────────────────────────────────────────────

  private async pollImapInbox(): Promise<void> {
    const host = this.configService.get<string>('IMAP_HOST');
    const port = this.configService.get<number>('IMAP_PORT', 993);
    const user = this.configService.get<string>('IMAP_USER');
    const password = this.configService.get<string>('IMAP_PASS');
    const tls = this.configService.get<string>('IMAP_TLS', 'true') === 'true';

    if (!host || !user || !password) {
      this.logger.debug('IMAP not configured — skipping poll');
      return;
    }

    try {
      // Dynamic import — imap-simple must be installed
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const imaps = require('imap-simple');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { simpleParser } = require('mailparser');

      const config = {
        imap: {
          user,
          password,
          host,
          port,
          tls,
          authTimeout: 10000,
          tlsOptions: { rejectUnauthorized: false },
        },
      };

      const connection = await imaps.connect(config);
      await connection.openBox('INBOX');

      // Search for unread messages received in the last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const dateStr = sevenDaysAgo.toDateString();

      const searchCriteria = ['UNSEEN', ['SINCE', dateStr]];
      const fetchOptions = { bodies: ['HEADER.FIELDS (FROM TO SUBJECT DATE MESSAGE-ID)', 'TEXT', ''], struct: true };

      const messages = await connection.search(searchCriteria, fetchOptions);
      this.logger.log(`Found ${messages.length} unread emails`);

      for (const message of messages) {
        try {
          const all = message.parts.find((p: any) => p.which === '');
          if (!all) continue;

          const parsed = await simpleParser(all.body);
          const messageId = parsed.messageId || `imap_${Date.now()}_${Math.random()}`;

          if (this.processedMessageIds.has(messageId)) continue;
          this.processedMessageIds.add(messageId);

          const email: ParsedEmail = {
            from: parsed.from?.value?.[0]?.address ?? '',
            fromName: parsed.from?.value?.[0]?.name ?? '',
            to: parsed.to?.value?.[0]?.address ?? user,
            subject: parsed.subject ?? '(No Subject)',
            bodyHtml: parsed.html || parsed.textAsHtml || `<p>${parsed.text ?? ''}</p>`,
            bodyText: parsed.text ?? '',
            messageId,
            threadId: parsed.inReplyTo ?? undefined,
            receivedAt: parsed.date ?? new Date(),
          };

          await this.processIncomingEmail(email);

          // Mark as seen
          await connection.addFlags(message.attributes.uid, ['\\Seen']);
        } catch (err) {
          this.logger.error('Error processing IMAP message:', err.message);
        }
      }

      await connection.end();
    } catch (error) {
      this.logger.error('IMAP connection error:', error.message);
    }
  }

  // ─── Gmail API Polling ────────────────────────────────────────────────────

  private async pollGmailInbox(): Promise<void> {
    const clientId = this.configService.get<string>('GMAIL_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GMAIL_CLIENT_SECRET');
    const refreshToken = this.configService.get<string>('GMAIL_REFRESH_TOKEN');
    const gmailUser = this.configService.get<string>('GMAIL_USER');

    if (!clientId || !clientSecret || !refreshToken) {
      this.logger.debug('Gmail API not configured — skipping poll');
      return;
    }

    try {
      // Dynamic import — googleapis must be installed
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { google } = require('googleapis');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { simpleParser } = require('mailparser');

      const auth = new google.auth.OAuth2(clientId, clientSecret);
      auth.setCredentials({ refresh_token: refreshToken });

      const gmail = google.gmail({ version: 'v1', auth });

      // List unread messages from the last 7 days
      const sevenDaysAgo = Math.floor((Date.now() - 7 * 24 * 3600 * 1000) / 1000);
      const listRes = await gmail.users.messages.list({
        userId: gmailUser ?? 'me',
        q: `is:unread after:${sevenDaysAgo}`,
        maxResults: 50,
      });

      const messages = listRes.data.messages ?? [];
      this.logger.log(`Found ${messages.length} unread Gmail messages`);

      for (const msg of messages) {
        if (this.processedMessageIds.has(msg.id!)) continue;
        this.processedMessageIds.add(msg.id!);

        const fullMsg = await gmail.users.messages.get({
          userId: gmailUser ?? 'me',
          id: msg.id!,
          format: 'raw',
        });

        const rawBuffer = Buffer.from(fullMsg.data.raw, 'base64url');
        const parsed = await simpleParser(rawBuffer);

        const email: ParsedEmail = {
          from: parsed.from?.value?.[0]?.address ?? '',
          fromName: parsed.from?.value?.[0]?.name ?? '',
          to: parsed.to?.value?.[0]?.address ?? '',
          subject: parsed.subject ?? '(No Subject)',
          bodyHtml: parsed.html || parsed.textAsHtml || `<p>${parsed.text ?? ''}</p>`,
          bodyText: parsed.text ?? '',
          messageId: msg.id!,
          threadId: fullMsg.data.threadId,
          receivedAt: parsed.date ?? new Date(),
        };

        await this.processIncomingEmail(email);

        // Mark as read
        await gmail.users.messages.modify({
          userId: gmailUser ?? 'me',
          id: msg.id!,
          requestBody: { removeLabelIds: ['UNREAD'] },
        });
      }
    } catch (error) {
      this.logger.error('Gmail API error:', error.message);
    }
  }

  // ─── Core Processing Pipeline ─────────────────────────────────────────────

  /**
   * Process a single parsed email through the full AI pipeline:
   * classify → find/create lead → trigger AI reply
   */
  async processIncomingEmail(email: ParsedEmail): Promise<void> {
    if (!email.from || email.from.includes('noreply') || email.from.includes('no-reply')) {
      return;
    }

    this.logger.log(`Processing email from ${email.from}: "${email.subject}"`);

    try {
      // Step 1 — Classify the email
      const classification = await this.classifyEmail(email);
      this.logger.log(
        `Classified as ${classification.interestType} (confidence: ${classification.confidence})`,
      );

      // Step 2 — Find or create lead
      let lead = await this.leadsService.findByEmail(email.from);

      if (!lead) {
        // Create new lead from email
        const nameParts = email.fromName?.split(' ') ?? [];
        lead = await this.leadsService.createFromForm({
          firstName: classification.extractedName?.split(' ')[0] ?? nameParts[0] ?? 'Unknown',
          lastName:
            classification.extractedName?.split(' ').slice(1).join(' ') ??
            nameParts.slice(1).join(' ') ??
            '',
          email: email.from,
          phoneNumber: classification.extractedPhone ?? '',
          interestType: classification.interestType,
          country: classification.extractedCountry,
          notes: `Auto-created from incoming email: "${email.subject}"`,
          source: 'email',
        });

        this.logger.log(`Created new lead ${lead.id} from email ${email.from}`);
      } else if (lead.interestType === InterestType.OTHER && classification.interestType !== InterestType.OTHER) {
        // Update interest type if we got a better classification
        await this.leadsService.update(lead.id, { interestType: classification.interestType });
      }

      // Step 3 — Hand off to EmailsService for AI reply
      const incoming: IncomingEmail = {
        from: email.from,
        to: email.to,
        subject: email.subject,
        bodyHtml: email.bodyHtml,
        bodyText: email.bodyText,
        messageId: email.messageId,
        threadId: email.threadId,
      };

      await this.emailsService.handleIncomingEmail(incoming);
    } catch (error) {
      this.logger.error(`Failed to process email from ${email.from}:`, error.message);
    }
  }

  // ─── AI Classification ────────────────────────────────────────────────────

  /**
   * Classify email as study_in_spain | work_in_czech | other
   * using keyword heuristics first, then OpenAI for ambiguous cases.
   */
  async classifyEmail(email: ParsedEmail): Promise<ClassificationResult> {
    const text = `${email.subject} ${email.bodyText}`.toLowerCase();

    // ── Fast keyword heuristics ──────────────────────────────────────────────
    const studyKeywords = [
      'study', 'student', 'university', 'college', 'degree', 'bachelor', 'master',
      'estudiar', 'estudia', 'spain', 'españa', 'spanish', 'education', 'scholarship',
      'erasmus', 'curso', 'visa estudiante', 'study abroad', 'academic',
    ];

    const workKeywords = [
      'work', 'job', 'employment', 'career', 'hire', 'position', 'vacancy', 'salary',
      'czech', 'czechia', 'prague', 'brno', 'republic', 'trabajo', 'trabajar',
      'work permit', 'work visa', 'skilled worker', 'labour', 'labor', 'profession',
    ];

    const studyScore = studyKeywords.filter(k => text.includes(k)).length;
    const workScore = workKeywords.filter(k => text.includes(k)).length;

    let interestType: InterestType;
    let confidence: number;

    if (studyScore > workScore && studyScore >= 2) {
      interestType = InterestType.STUDY_IN_SPAIN;
      confidence = Math.min(0.95, 0.6 + studyScore * 0.05);
    } else if (workScore > studyScore && workScore >= 2) {
      interestType = InterestType.WORK_IN_CZECH;
      confidence = Math.min(0.95, 0.6 + workScore * 0.05);
    } else if (studyScore === 1 && workScore === 0) {
      interestType = InterestType.STUDY_IN_SPAIN;
      confidence = 0.55;
    } else if (workScore === 1 && studyScore === 0) {
      interestType = InterestType.WORK_IN_CZECH;
      confidence = 0.55;
    } else {
      // Ambiguous — use AI
      return this.classifyEmailWithAI(email);
    }

    // Extract basic info from text
    const phone = this.extractPhone(text);
    const country = this.extractCountry(text);

    return {
      interestType,
      confidence,
      extractedPhone: phone,
      extractedCountry: country,
      summary: `Classified as ${interestType} via keyword matching (study:${studyScore} work:${workScore})`,
    };
  }

  /**
   * Deep AI classification for ambiguous emails using OpenAI
   */
  private async classifyEmailWithAI(email: ParsedEmail): Promise<ClassificationResult> {
    try {
      // Reuse AiService's OpenAI client via extractQualificationData
      const combinedText = [email.subject, email.bodyText].join('\n\n').slice(0, 2000);

      const systemPrompt = `You are a classification system for Heavenly Drops, a study and work abroad consultancy.
Classify the following email and extract contact information.

Programs offered:
- Study in Spain (university/language programs)
- Work in Czech Republic (employment programs)

Respond ONLY with valid JSON:
{
  "interestType": "study_in_spain" | "work_in_czech" | "other",
  "confidence": 0.0-1.0,
  "extractedName": "Full Name or null",
  "extractedPhone": "+1234567890 or null",
  "extractedCountry": "Country name or null",
  "summary": "One sentence describing the inquiry"
}`;

      // Use the OpenAI client through ai.service's extractQualificationData method
      const result = await this.aiService.extractQualificationData(
        `CLASSIFY THIS EMAIL:\nSubject: ${email.subject}\n\nBody:\n${combinedText}\n\nSystem: ${systemPrompt}`,
      );

      if (result && result['interestType']) {
        return {
          interestType: (result['interestType'] as InterestType) ?? InterestType.OTHER,
          confidence: parseFloat(result['confidence'] as string) || 0.7,
          extractedName: result['extractedName'] as string,
          extractedPhone: result['extractedPhone'] as string,
          extractedCountry: result['extractedCountry'] as string,
          summary: (result['summary'] as string) ?? 'AI classified',
        };
      }
    } catch (error) {
      this.logger.error('AI classification failed:', error.message);
    }

    return {
      interestType: InterestType.OTHER,
      confidence: 0.3,
      summary: 'Classification failed — marked as other',
    };
  }

  /**
   * Extract phone number from free text
   */
  private extractPhone(text: string): string | undefined {
    const match = text.match(/(?:\+|00)?[\d\s\-().]{9,18}(?=\s|$)/);
    return match ? match[0].replace(/\s/g, '') : undefined;
  }

  /**
   * Extract country name from text
   */
  private extractCountry(text: string): string | undefined {
    const countries = [
      'turkey', 'türkiye', 'iran', 'iraq', 'jordan', 'egypt', 'morocco',
      'pakistan', 'india', 'nigeria', 'ghana', 'kenya', 'south africa',
      'brazil', 'colombia', 'mexico', 'argentina', 'ukraine', 'russia',
      'georgia', 'azerbaijan', 'uzbekistan', 'kazakhstan',
    ];

    for (const country of countries) {
      if (text.includes(country)) {
        return country.charAt(0).toUpperCase() + country.slice(1);
      }
    }

    return undefined;
  }

  // ─── Manual Trigger (for backfilling old emails) ──────────────────────────

  /**
   * Manually process a batch of emails — call this from the API to backfill
   * historical emails that arrived before the AI manager was set up.
   */
  async processEmailBatch(emails: ParsedEmail[]): Promise<{
    processed: number;
    classified: { study: number; work: number; other: number };
    errors: number;
  }> {
    const stats = { processed: 0, classified: { study: 0, work: 0, other: 0 }, errors: 0 };

    for (const email of emails) {
      try {
        await this.processIncomingEmail(email);
        stats.processed++;

        const cls = await this.classifyEmail(email);
        if (cls.interestType === InterestType.STUDY_IN_SPAIN) stats.classified.study++;
        else if (cls.interestType === InterestType.WORK_IN_CZECH) stats.classified.work++;
        else stats.classified.other++;
      } catch {
        stats.errors++;
      }
    }

    return stats;
  }
}
