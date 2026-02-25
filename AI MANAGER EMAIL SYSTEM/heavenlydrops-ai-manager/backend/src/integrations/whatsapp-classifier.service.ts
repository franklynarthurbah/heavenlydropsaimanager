/**
 * WhatsApp Intent Classifier
 *
 * Classifies every incoming WhatsApp message into one of:
 *   - intent: "study_in_spain" | "work_in_czech" | "general_inquiry" | "appointment_request" | "other"
 *   - sentiment: "positive" | "neutral" | "negative"
 *   - urgency: "high" | "medium" | "low"
 *
 * Uses fast keyword matching first (no API cost) and falls back to OpenAI
 * for ambiguous messages. Classification result is attached to each
 * Conversation so the AI chatbot can pick the correct program knowledge.
 *
 * Also handles language detection so Turkish/Arabic speakers get routed
 * to a bilingual response template.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { InterestType } from '../leads/entities/lead.entity';

export interface MessageClassification {
  interestType: InterestType;
  intent: MessageIntent;
  sentiment: 'positive' | 'neutral' | 'negative';
  urgency: 'high' | 'medium' | 'low';
  language: 'en' | 'tr' | 'ar' | 'es' | 'other';
  confidence: number;
  extractedInfo: {
    name?: string;
    phone?: string;
    country?: string;
    budget?: string;
    timeline?: string;
  };
  suggestedResponse?: string;
}

export enum MessageIntent {
  STUDY_INQUIRY      = 'study_inquiry',       // Asking about studying abroad
  WORK_INQUIRY       = 'work_inquiry',         // Asking about working abroad
  APPOINTMENT_REQ    = 'appointment_request',  // Wants to book a call/meeting
  DOCUMENT_QUESTION  = 'document_question',    // Asking about documents/requirements
  COST_QUESTION      = 'cost_question',        // Asking about fees/prices
  STATUS_UPDATE      = 'status_update',        // Existing applicant asking for status
  GREETING           = 'greeting',             // Hello / first message
  FAREWELL           = 'farewell',             // Goodbye / thanks
  OTHER              = 'other',
}

@Injectable()
export class WhatsAppClassifierService {
  private readonly logger = new Logger(WhatsAppClassifierService.name);
  private openai: OpenAI;

  // ─── Keyword banks ────────────────────────────────────────────────────────

  private readonly STUDY_KEYWORDS = [
    // English
    'study', 'university', 'college', 'bachelor', 'master', 'degree', 'student',
    'education', 'school', 'scholarship', 'erasmus', 'academic', 'course',
    'spain', 'españa', 'spanish', 'madrid', 'barcelona', 'seville',
    // Turkish
    'okumak', 'üniversite', 'eğitim', 'öğrenci', 'burs', 'ispanya',
    // Arabic
    'دراسة', 'جامعة', 'تعليم', 'طالب',
  ];

  private readonly WORK_KEYWORDS = [
    // English
    'work', 'job', 'employment', 'career', 'hire', 'position', 'salary',
    'czech', 'czechia', 'prague', 'brno', 'ostrava', 'work permit', 'work visa',
    'labour', 'labor', 'skilled', 'worker', 'factory', 'engineer', 'nurse',
    // Turkish
    'çalışmak', 'iş', 'istihdam', 'çek cumhuriyeti', 'çek', 'prag', 'maaş',
    // Arabic
    'عمل', 'وظيفة', 'تشيكيا',
  ];

  private readonly APPOINTMENT_KEYWORDS = [
    'book', 'appointment', 'consultation', 'call', 'meeting', 'schedule',
    'speak', 'talk', 'available', 'when can', 'randevu', 'görüşme', 'toplantı',
  ];

  private readonly DOCUMENT_KEYWORDS = [
    'document', 'passport', 'visa', 'requirement', 'papers', 'certificate',
    'diploma', 'transcript', 'form', 'belge', 'pasaport', 'vize',
  ];

  private readonly COST_KEYWORDS = [
    'price', 'cost', 'fee', 'how much', 'payment', 'money', 'budget', 'afford',
    'fiyat', 'ücret', 'ne kadar', 'para',
  ];

  constructor(private configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  // ─── Main Classification Entry Point ─────────────────────────────────────

  /**
   * Classify a single WhatsApp message.
   * Fast-path: keyword match. Slow-path: OpenAI.
   */
  async classifyMessage(
    messageText: string,
    conversationHistory: string[] = [],
  ): Promise<MessageClassification> {
    const text = messageText.toLowerCase();

    // Detect language first
    const language = this.detectLanguage(text);

    // Keyword scoring
    const studyScore  = this.STUDY_KEYWORDS.filter(k => text.includes(k)).length;
    const workScore   = this.WORK_KEYWORDS.filter(k => text.includes(k)).length;
    const apptScore   = this.APPOINTMENT_KEYWORDS.filter(k => text.includes(k)).length;
    const docScore    = this.DOCUMENT_KEYWORDS.filter(k => text.includes(k)).length;
    const costScore   = this.COST_KEYWORDS.filter(k => text.includes(k)).length;

    // Check for greeting / farewell
    const isGreeting = /^(hi|hello|hey|merhaba|selam|سلام|hola|buenos|good morning|good afternoon|good evening)/i.test(text.trim());
    const isFarewell = /\b(goodbye|bye|thanks|thank you|teşekkür|شكرا)\b/i.test(text);

    // Determine dominant intent from keywords
    const scores = {
      [MessageIntent.STUDY_INQUIRY]: studyScore * 2,
      [MessageIntent.WORK_INQUIRY]: workScore * 2,
      [MessageIntent.APPOINTMENT_REQ]: apptScore * 3, // Weight appointments higher
      [MessageIntent.DOCUMENT_QUESTION]: docScore,
      [MessageIntent.COST_QUESTION]: costScore,
      [MessageIntent.GREETING]: isGreeting ? 5 : 0,
      [MessageIntent.FAREWELL]: isFarewell ? 5 : 0,
      [MessageIntent.OTHER]: 0,
    };

    const topIntent = Object.entries(scores)
      .sort(([, a], [, b]) => b - a)[0];

    const totalScore = studyScore + workScore + apptScore + docScore + costScore;

    // Determine interest type
    let interestType: InterestType;
    if (studyScore > workScore) interestType = InterestType.STUDY_IN_SPAIN;
    else if (workScore > studyScore) interestType = InterestType.WORK_IN_CZECH;
    else interestType = InterestType.OTHER;

    // High confidence if clear keyword signal
    const confidence = totalScore >= 3 ? 0.9 : totalScore === 2 ? 0.75 : totalScore === 1 ? 0.6 : 0.4;

    // If low confidence, use AI
    if (confidence < 0.6 && messageText.length > 20) {
      return this.classifyWithAI(messageText, conversationHistory, language);
    }

    return {
      interestType,
      intent: topIntent[1] > 0 ? (topIntent[0] as MessageIntent) : MessageIntent.OTHER,
      sentiment: this.detectSentiment(text),
      urgency: this.detectUrgency(text),
      language,
      confidence,
      extractedInfo: {
        phone: this.extractPhone(text),
        country: this.extractCountry(text),
      },
    };
  }

  // ─── AI Classification ────────────────────────────────────────────────────

  private async classifyWithAI(
    message: string,
    history: string[],
    detectedLang: MessageClassification['language'],
  ): Promise<MessageClassification> {
    const prompt = `Classify this WhatsApp message for Heavenly Drops, a study/work abroad consultancy.

Programs:
- Study in Spain (universities, language schools)
- Work in Czech Republic (employment programs)

Message: "${message}"
${history.length ? `Recent history:\n${history.slice(-3).join('\n')}` : ''}

Respond ONLY with JSON:
{
  "interestType": "study_in_spain" | "work_in_czech" | "other",
  "intent": "study_inquiry" | "work_inquiry" | "appointment_request" | "document_question" | "cost_question" | "greeting" | "farewell" | "other",
  "sentiment": "positive" | "neutral" | "negative",
  "urgency": "high" | "medium" | "low",
  "confidence": 0.0-1.0,
  "extractedInfo": {
    "name": null,
    "phone": null,
    "country": null,
    "budget": null,
    "timeline": null
  },
  "suggestedResponse": "Brief suggested response in the same language as the message"
}`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: this.configService.get('OPENAI_MODEL', 'gpt-4o-mini'),
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 300,
        response_format: { type: 'json_object' },
      });

      const raw = completion.choices[0]?.message?.content ?? '{}';
      const parsed = JSON.parse(raw);

      return {
        interestType: parsed.interestType ?? InterestType.OTHER,
        intent: parsed.intent ?? MessageIntent.OTHER,
        sentiment: parsed.sentiment ?? 'neutral',
        urgency: parsed.urgency ?? 'medium',
        language: detectedLang,
        confidence: parsed.confidence ?? 0.7,
        extractedInfo: parsed.extractedInfo ?? {},
        suggestedResponse: parsed.suggestedResponse,
      };
    } catch (error) {
      this.logger.error('AI classification failed:', error.message);
      return this.defaultClassification(detectedLang);
    }
  }

  // ─── Helper Methods ───────────────────────────────────────────────────────

  private detectLanguage(text: string): MessageClassification['language'] {
    const arabicPattern = /[\u0600-\u06FF]/;
    const turkishPattern = /[çğışöüÇĞİŞÖÜ]/;
    const spanishPattern = /[áéíóúñ¿¡]/;

    if (arabicPattern.test(text)) return 'ar';
    if (turkishPattern.test(text)) return 'tr';
    if (spanishPattern.test(text)) return 'es';
    return 'en';
  }

  private detectSentiment(text: string): 'positive' | 'neutral' | 'negative' {
    const positiveWords = ['great', 'excellent', 'interested', 'excited', 'love', 'yes', 'please', 'want', 'need', 'harika', 'mükemmel'];
    const negativeWords = ['no', 'not', 'never', 'expensive', 'problem', 'issue', 'worried', 'scared', 'pahalı', 'sorun'];

    const posScore = positiveWords.filter(w => text.includes(w)).length;
    const negScore = negativeWords.filter(w => text.includes(w)).length;

    if (posScore > negScore) return 'positive';
    if (negScore > posScore) return 'negative';
    return 'neutral';
  }

  private detectUrgency(text: string): 'high' | 'medium' | 'low' {
    const highUrgency = ['urgent', 'asap', 'immediately', 'today', 'now', 'emergency', 'acil', 'hemen'];
    const lowUrgency = ['whenever', 'someday', 'maybe', 'thinking about', 'considering'];

    if (highUrgency.some(w => text.includes(w))) return 'high';
    if (lowUrgency.some(w => text.includes(w))) return 'low';
    return 'medium';
  }

  private extractPhone(text: string): string | undefined {
    const match = text.match(/(?:\+|00)?[\d\s\-().]{9,18}/);
    return match ? match[0].replace(/\s/g, '') : undefined;
  }

  private extractCountry(text: string): string | undefined {
    const countries: Record<string, string> = {
      'turkey': 'Turkey', 'türkiye': 'Turkey', 'türk': 'Turkey',
      'iran': 'Iran', 'iraq': 'Iraq', 'jordan': 'Jordan',
      'egypt': 'Egypt', 'morocco': 'Morocco', 'pakistan': 'Pakistan',
      'india': 'India', 'nigeria': 'Nigeria', 'ghana': 'Ghana',
      'ukraine': 'Ukraine', 'georgia': 'Georgia', 'azerbaijan': 'Azerbaijan',
    };

    for (const [keyword, country] of Object.entries(countries)) {
      if (text.includes(keyword)) return country;
    }
    return undefined;
  }

  private defaultClassification(language: MessageClassification['language']): MessageClassification {
    return {
      interestType: InterestType.OTHER,
      intent: MessageIntent.OTHER,
      sentiment: 'neutral',
      urgency: 'medium',
      language,
      confidence: 0.3,
      extractedInfo: {},
    };
  }

  // ─── Batch Classification ─────────────────────────────────────────────────

  /**
   * Classify a batch of messages from historical WhatsApp export.
   * Returns classification results and lead creation suggestions.
   */
  async classifyBatch(messages: { phone: string; text: string; timestamp: Date }[]): Promise<{
    classified: (MessageClassification & { phone: string; timestamp: Date })[];
    summary: {
      studyInquiries: number;
      workInquiries: number;
      other: number;
      byUrgency: Record<string, number>;
      byLanguage: Record<string, number>;
    };
  }> {
    const classified: any[] = [];
    const summary = {
      studyInquiries: 0,
      workInquiries: 0,
      other: 0,
      byUrgency: { high: 0, medium: 0, low: 0 },
      byLanguage: { en: 0, tr: 0, ar: 0, es: 0, other: 0 },
    };

    for (const msg of messages) {
      const result = await this.classifyMessage(msg.text);
      classified.push({ ...result, phone: msg.phone, timestamp: msg.timestamp });

      if (result.interestType === InterestType.STUDY_IN_SPAIN) summary.studyInquiries++;
      else if (result.interestType === InterestType.WORK_IN_CZECH) summary.workInquiries++;
      else summary.other++;

      summary.byUrgency[result.urgency]++;
      summary.byLanguage[result.language]++;
    }

    return { classified, summary };
  }
}
