/**
 * Form Parser Service
 *
 * Detects and parses emails that originate from online contact /
 * application forms (typically sent via WordPress, Gravity Forms,
 * WPForms, or custom HTML forms on www.workandstudyabroad.com.tr).
 *
 * Pipeline:
 *   1. Detect whether the email is a form submission.
 *   2. Parse field key/value pairs from the body.
 *   3. Create or update a Lead in the AI Manager.
 *   4. Trigger the appropriate chatbot / voice workflow.
 *   5. Persist results to form_submissions.
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { LeadsService } from '../leads/leads.service';
import { InterestType } from '../leads/entities/lead.entity';

export interface FormSubmission {
  formType: string;
  formSource?: string;
  parsedFields: Record<string, string>;
  leadData: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    country?: string;
    interestType?: InterestType;
    message?: string;
  };
  workflowTriggered?: string;
}

@Injectable()
export class FormParserService {
  private readonly logger = new Logger(FormParserService.name);

  // Subjects that typically come from WordPress/form plugins
  private readonly FORM_SUBJECT_PATTERNS = [
    /new message from/i,
    /contact form submission/i,
    /form submission/i,
    /website inquiry/i,
    /new inquiry/i,
    /application received/i,
    /new application/i,
    /form entry/i,
    /you have a new message/i,
    /new lead/i,
    /new registration/i,
  ];

  // WordPress/WPForms/GravityForms X-Mailer headers
  private readonly FORM_SENDERS = [
    'wordpress@',
    'noreply@',
    'no-reply@',
    'forms@',
    'contact@',
    'info@',
  ];

  constructor(
    @InjectDataSource()
    private dataSource: DataSource,
    private leadsService: LeadsService,
  ) {}

  // ── Detection ────────────────────────────────────────────────────────────

  isFormSubmission(subject: string, from: string, bodyText: string): boolean {
    // Check subject patterns
    if (this.FORM_SUBJECT_PATTERNS.some(p => p.test(subject))) return true;

    // Check for typical form-field patterns in body (e.g., "Name: John\nEmail: john@...")
    const fieldPattern = /^[\w\s]+:\s*.+$/m;
    const matches = (bodyText.match(/^[\w\s]+:\s*.+$/gm) ?? []).length;
    if (matches >= 3) return true;

    return false;
  }

  // ── Parsing ──────────────────────────────────────────────────────────────

  async parse(
    emailLogId: string,
    subject: string,
    from: string,
    bodyText: string,
    bodyHtml: string,
  ): Promise<FormSubmission | null> {
    if (!this.isFormSubmission(subject, from, bodyText)) return null;

    const formType = this.detectFormType(subject, bodyText);
    const formSource = this.extractFormSource(bodyText, bodyHtml);
    const parsedFields = this.extractFields(bodyText);

    const leadData = this.mapFieldsToLead(from, parsedFields);
    const workflowTriggered = this.determineWorkflow(formType, leadData);

    // Create or update lead
    let leadId: string | null = null;
    try {
      if (leadData.email) {
        let lead = await this.leadsService.findByEmail(leadData.email);
        if (!lead) {
          lead = await this.leadsService.createFromForm({
            firstName: leadData.firstName ?? 'Unknown',
            lastName: leadData.lastName ?? '',
            email: leadData.email,
            phoneNumber: leadData.phone ?? '',
            interestType: leadData.interestType ?? InterestType.OTHER,
            country: leadData.country,
            notes: leadData.message ?? '',
            source: 'web_form',
          });
          this.logger.log(`Created lead ${lead.id} from form submission (${formType})`);
        } else {
          // Update existing lead with new info
          await this.leadsService.update(lead.id, {
            ...(leadData.phone && { phoneNumber: leadData.phone }),
            ...(leadData.country && { country: leadData.country }),
            ...(leadData.message && { notes: leadData.message }),
          });
        }
        leadId = lead.id;
      }
    } catch (err) {
      this.logger.error('Lead creation from form failed:', err.message);
    }

    // Persist
    await this.dataSource.query(
      `INSERT INTO form_submissions
         (email_log_id, form_type, form_source, parsed_fields, lead_id, workflow_triggered)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (email_log_id) DO UPDATE SET
         form_type = EXCLUDED.form_type,
         parsed_fields = EXCLUDED.parsed_fields,
         lead_id = EXCLUDED.lead_id,
         processed_at = now()`,
      [emailLogId, formType, formSource, JSON.stringify(parsedFields), leadId, workflowTriggered],
    );

    // Mark email_log as form submission
    await this.dataSource.query(
      `UPDATE email_logs SET form_submission = true WHERE id = $1`,
      [emailLogId],
    );

    return {
      formType,
      formSource: formSource ?? undefined,
      parsedFields,
      leadData,
      workflowTriggered,
    };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private detectFormType(subject: string, body: string): string {
    const s = (subject + body).toLowerCase();
    if (/application|apply|enrollment/i.test(s)) return 'application';
    if (/quote|pricing|cost|fee/i.test(s)) return 'quote';
    if (/newsletter|subscribe/i.test(s)) return 'newsletter';
    if (/appointment|meeting|schedule/i.test(s)) return 'appointment';
    return 'contact';
  }

  private extractFormSource(bodyText: string, bodyHtml: string): string | null {
    // Look for "Sent from: https://..." patterns
    const match =
      bodyText.match(/(?:sent from|source|page|url|website)[:\s]+([^\n\r]+)/i) ??
      bodyHtml.match(/href="([^"]*workandstudyabroad[^"]*)"/i);
    return match ? match[1].trim() : null;
  }

  private extractFields(bodyText: string): Record<string, string> {
    const fields: Record<string, string> = {};
    // Match patterns: "FieldName: value" or "FieldName\n value"
    const lines = bodyText.split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/^([\w\s\-\/]{2,40}):\s*(.+)$/);
      if (match) {
        const key = match[1].trim().toLowerCase().replace(/\s+/g, '_');
        fields[key] = match[2].trim();
      }
    }
    return fields;
  }

  private mapFieldsToLead(senderEmail: string, fields: Record<string, string>) {
    // Normalize common field names
    const get = (...keys: string[]): string | undefined => {
      for (const k of keys) {
        if (fields[k]) return fields[k];
      }
      return undefined;
    };

    const fullName = get('name', 'full_name', 'your_name') ?? '';
    const nameParts = fullName.split(' ');

    let interestType: InterestType = InterestType.OTHER;
    const interest = (get('interest', 'program', 'service', 'inquiry_type') ?? '').toLowerCase();
    if (/study|spain|education/i.test(interest)) interestType = InterestType.STUDY_IN_SPAIN;
    else if (/work|czech|job|employment/i.test(interest)) interestType = InterestType.WORK_IN_CZECH;

    return {
      firstName: get('first_name') ?? nameParts[0],
      lastName: get('last_name') ?? nameParts.slice(1).join(' '),
      email: get('email', 'email_address', 'your_email') ?? senderEmail,
      phone: get('phone', 'phone_number', 'mobile', 'telephone'),
      country: get('country', 'nationality', 'country_of_origin'),
      interestType,
      message: get('message', 'your_message', 'inquiry', 'comments', 'description'),
    };
  }

  private determineWorkflow(formType: string, leadData: ReturnType<FormParserService['mapFieldsToLead']>): string {
    if (formType === 'appointment') return 'appointment-booking-workflow';
    if (leadData.interestType === InterestType.STUDY_IN_SPAIN) return 'study-spain-onboarding';
    if (leadData.interestType === InterestType.WORK_IN_CZECH) return 'work-czech-onboarding';
    return 'general-inquiry-workflow';
  }
}
