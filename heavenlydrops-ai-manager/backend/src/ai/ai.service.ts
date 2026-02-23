/**
 * AI Service
 * 
 * Central AI orchestration service that handles all LLM interactions.
 * Provides context-aware responses using knowledge documents.
 * 
 * Features:
 * - Chatbot responses for WhatsApp/Instagram
 * - Voice call script generation
 * - Email composition
 * - Conversation summarization
 * - Lead qualification
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { Lead, InterestType } from '../leads/entities/lead.entity';

export interface AIResponse {
  text: string;
  suggestedActions?: string[];
  tags?: string[];
  confidence: number;
  tokensUsed: number;
}

export interface ConversationContext {
  lead: Lead;
  conversationHistory: { role: 'user' | 'assistant'; content: string }[];
  channel: 'whatsapp' | 'instagram' | 'email' | 'voice';
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private openai: OpenAI;

  constructor(
    private configService: ConfigService,
    private knowledgeService: KnowledgeService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get('OPENAI_API_KEY'),
    });
  }

  /**
   * Generate chatbot response for WhatsApp/Instagram
   */
  async generateChatbotResponse(context: ConversationContext): Promise<AIResponse> {
    const startTime = Date.now();

    try {
      // Get relevant knowledge based on lead's interest
      const knowledgeDocs = await this.getRelevantKnowledge(context.lead);

      // Build system prompt
      const systemPrompt = this.buildChatbotSystemPrompt(context.lead, knowledgeDocs);

      // Build messages array
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        ...context.conversationHistory.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
      ];

      // Call OpenAI
      const completion = await this.openai.chat.completions.create({
        model: this.configService.get('OPENAI_MODEL', 'gpt-4o-mini'),
        messages,
        temperature: 0.7,
        max_tokens: 500,
        response_format: { type: 'json_object' },
      });

      const responseText = completion.choices[0]?.message?.content || '{}';
      const parsed = JSON.parse(responseText);

      this.logger.log(`Chatbot response generated in ${Date.now() - startTime}ms`);

      return {
        text: parsed.response || parsed.text || 'I apologize, I did not understand that.',
        suggestedActions: parsed.suggestedActions || [],
        tags: parsed.tags || [],
        confidence: parsed.confidence || 0.8,
        tokensUsed: completion.usage?.total_tokens || 0,
      };
    } catch (error) {
      this.logger.error('Error generating chatbot response:', error);
      return {
        text: 'I apologize, I am having trouble processing your request. A human agent will assist you shortly.',
        confidence: 0,
        tokensUsed: 0,
      };
    }
  }

  /**
   * Generate voice call script/questions
   */
  async generateVoiceScript(lead: Lead, callStage: 'opening' | 'qualification' | 'closing'): Promise<AIResponse> {
    const knowledgeDocs = await this.getRelevantKnowledge(lead);

    const systemPrompt = `You are a friendly female AI assistant calling on behalf of Heavenly Drops, a work and study abroad consultancy.
Your name is "Sarah". You speak in a warm, professional, and encouraging tone.

CALL STAGE: ${callStage}

ABOUT HEAVENLY DROPS:
${knowledgeDocs.aboutCompany}

${lead.interestType === InterestType.STUDY_IN_SPAIN ? `STUDY IN SPAIN INFORMATION:\n${knowledgeDocs.studyInSpain}` : ''}
${lead.interestType === InterestType.WORK_IN_CZECH ? `WORK IN CZECH REPUBLIC INFORMATION:\n${knowledgeDocs.workInCzech}` : ''}

LEAD INFORMATION:
- Name: ${lead.firstName} ${lead.lastName}
- Interest: ${lead.interestType}
- Country: ${lead.country || 'Unknown'}

INSTRUCTIONS:
1. Keep responses concise (2-3 sentences max for voice)
2. Ask one question at a time
3. Be empathetic and understanding
4. If they have questions, answer based on the knowledge provided
5. Always guide toward scheduling a consultation

Respond in JSON format:
{
  "script": "What to say",
  "nextQuestion": "The next question to ask",
  "suggestedActions": ["action1", "action2"],
  "tags": ["tag1", "tag2"]
}`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: this.configService.get('OPENAI_MODEL', 'gpt-4o-mini'),
        messages: [{ role: 'system', content: systemPrompt }],
        temperature: 0.7,
        max_tokens: 300,
        response_format: { type: 'json_object' },
      });

      const responseText = completion.choices[0]?.message?.content || '{}';
      const parsed = JSON.parse(responseText);

      return {
        text: parsed.script || parsed.text || '',
        suggestedActions: parsed.suggestedActions || [],
        tags: parsed.tags || [],
        confidence: 0.85,
        tokensUsed: completion.usage?.total_tokens || 0,
      };
    } catch (error) {
      this.logger.error('Error generating voice script:', error);
      return {
        text: 'Hello, this is Sarah from Heavenly Drops. I am calling about your interest in our programs. Do you have a few minutes to talk?',
        confidence: 0.5,
        tokensUsed: 0,
      };
    }
  }

  /**
   * Generate email response
   */
  async generateEmailResponse(
    lead: Lead,
    emailContent: string,
    emailThread: string[],
  ): Promise<AIResponse> {
    const knowledgeDocs = await this.getRelevantKnowledge(lead);

    const systemPrompt = `You are an email assistant for Heavenly Drops, a work and study abroad consultancy.
Write professional, helpful, and personalized email responses.

ABOUT HEAVENLY DROPS:
${knowledgeDocs.aboutCompany}

${lead.interestType === InterestType.STUDY_IN_SPAIN ? `STUDY IN SPAIN INFORMATION:\n${knowledgeDocs.studyInSpain}` : ''}
${lead.interestType === InterestType.WORK_IN_CZECH ? `WORK IN CZECH REPUBLIC INFORMATION:\n${knowledgeDocs.workInCzech}` : ''}

EMAIL GUIDELINES:
1. Use a professional but friendly tone
2. Address the recipient by name
3. Answer all questions thoroughly
4. Include a clear call-to-action
5. Add contact information at the end
6. Keep it concise but complete

Respond in JSON format:
{
  "subject": "Email subject line",
  "body": "Full email body with HTML formatting",
  "suggestedActions": ["action1", "action2"],
  "tags": ["tag1", "tag2"],
  "requiresApproval": false
}`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: this.configService.get('OPENAI_MODEL', 'gpt-4o'),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Previous emails:\n${emailThread.join('\n---\n')}\n\nNew email to respond to:\n${emailContent}` },
        ],
        temperature: 0.7,
        max_tokens: 1000,
        response_format: { type: 'json_object' },
      });

      const responseText = completion.choices[0]?.message?.content || '{}';
      const parsed = JSON.parse(responseText);

      return {
        text: parsed.body || parsed.text || '',
        suggestedActions: parsed.suggestedActions || [],
        tags: parsed.tags || [],
        confidence: parsed.requiresApproval ? 0.6 : 0.9,
        tokensUsed: completion.usage?.total_tokens || 0,
      };
    } catch (error) {
      this.logger.error('Error generating email response:', error);
      return {
        text: '<p>Thank you for your email. We will get back to you shortly.</p><p>Best regards,<br>Heavenly Drops Team</p>',
        confidence: 0.5,
        tokensUsed: 0,
      };
    }
  }

  /**
   * Summarize conversation for email notification
   */
  async summarizeConversation(
    messages: { sender: string; content: string; timestamp: Date }[],
  ): Promise<AIResponse> {
    const conversationText = messages
      .map((m) => `[${m.sender}]: ${m.content}`)
      .join('\n');

    const systemPrompt = `Summarize the following conversation into a concise summary for the team.
Include key points, customer questions, and any action items.

Respond in JSON format:
{
  "summary": "Brief summary paragraph",
  "keyPoints": ["point1", "point2"],
  "actionItems": ["action1", "action2"],
  "sentiment": "positive/neutral/negative",
  "qualificationScore": 0-100
}`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: this.configService.get('OPENAI_MODEL', 'gpt-4o-mini'),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: conversationText },
        ],
        temperature: 0.5,
        max_tokens: 500,
        response_format: { type: 'json_object' },
      });

      const responseText = completion.choices[0]?.message?.content || '{}';
      const parsed = JSON.parse(responseText);

      return {
        text: parsed.summary || '',
        suggestedActions: parsed.actionItems || [],
        tags: [parsed.sentiment, `qualification:${parsed.qualificationScore}`],
        confidence: 0.85,
        tokensUsed: completion.usage?.total_tokens || 0,
      };
    } catch (error) {
      this.logger.error('Error summarizing conversation:', error);
      return {
        text: 'Conversation summary unavailable.',
        confidence: 0,
        tokensUsed: 0,
      };
    }
  }

  /**
   * Extract qualification data from conversation
   */
  async extractQualificationData(
    conversation: string,
  ): Promise<Record<string, string>> {
    const systemPrompt = `Extract qualification information from this conversation.
Return a JSON object with these fields if found:
- hasPassport (yes/no/unknown)
- englishLevel (beginner/intermediate/advanced/fluent/unknown)
- budget (amount or range)
- timeline (when they want to start)
- previousExperience (any relevant experience)
- objections (any concerns they raised)

Respond in JSON format only.`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: this.configService.get('OPENAI_MODEL', 'gpt-4o-mini'),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: conversation },
        ],
        temperature: 0.3,
        max_tokens: 300,
        response_format: { type: 'json_object' },
      });

      const responseText = completion.choices[0]?.message?.content || '{}';
      return JSON.parse(responseText);
    } catch (error) {
      this.logger.error('Error extracting qualification data:', error);
      return {};
    }
  }

  /**
   * Get relevant knowledge documents for a lead
   */
  private async getRelevantKnowledge(lead: Lead): Promise<{
    studyInSpain: string;
    workInCzech: string;
    aboutCompany: string;
  }> {
    const [studyInSpain, workInCzech, aboutCompany] = await Promise.all([
      this.knowledgeService.getDocumentByType('study_in_spain'),
      this.knowledgeService.getDocumentByType('work_in_czech'),
      this.knowledgeService.getDocumentByType('about_company'),
    ]);

    return {
      studyInSpain: studyInSpain?.content || 'Information about studying in Spain.',
      workInCzech: workInCzech?.content || 'Information about working in Czech Republic.',
      aboutCompany: aboutCompany?.content || 'Heavenly Drops - Work and Study Abroad consultancy.',
    };
  }

  /**
   * Build system prompt for chatbot
   */
  private buildChatbotSystemPrompt(
    lead: Lead,
    knowledge: { studyInSpain: string; workInCzech: string; aboutCompany: string },
  ): string {
    return `You are "Elena", a friendly AI assistant for Heavenly Drops, a work and study abroad consultancy.
You help customers through WhatsApp and Instagram with their questions about our programs.

ABOUT HEAVENLY DROPS:
${knowledge.aboutCompany}

${lead.interestType === InterestType.STUDY_IN_SPAIN ? `STUDY IN SPAIN PROGRAM:\n${knowledge.studyInSpain}` : ''}
${lead.interestType === InterestType.WORK_IN_CZECH ? `WORK IN CZECH REPUBLIC PROGRAM:\n${knowledge.workInCzech}` : ''}

CUSTOMER INFORMATION:
- Name: ${lead.firstName} ${lead.lastName}
- Interest: ${lead.interestType || 'General inquiry'}
- Country: ${lead.country || 'Unknown'}

RESPONSE GUIDELINES:
1. Be warm, friendly, and professional
2. Keep responses concise (2-4 sentences for chat)
3. Answer based ONLY on the knowledge provided above
4. If you don't know something, say you'll connect them with a specialist
5. Always try to qualify the lead by asking relevant questions
6. Guide toward scheduling a consultation when appropriate
7. Use emojis sparingly and appropriately
8. Speak in a conversational, natural way

IMPORTANT RULES:
- NEVER make up information not in the knowledge base
- NEVER promise specific outcomes (visa approval, job placement)
- ALWAYS be honest about what you can and cannot do
- If they ask about pricing, give general ranges only

Respond in JSON format:
{
  "response": "Your response text here",
  "suggestedActions": ["schedule_appointment", "send_brochure", "connect_human"],
  "tags": ["interested", "pricing_question", "urgent"],
  "confidence": 0.95
}`;
  }
}
