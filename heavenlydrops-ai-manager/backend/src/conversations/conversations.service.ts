/**
 * Conversations Service
 * 
 * Manages chat conversations across WhatsApp, Instagram, and other channels.
 * Integrates with AI for automated responses.
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation, ConversationChannel, ConversationStatus } from './entities/conversation.entity';
import { Message, MessageSender, MessageStatus } from './entities/message.entity';
import { WhatsAppService } from '../integrations/whatsapp.service';
import { InstagramService } from '../integrations/instagram.service';
import { AiService } from '../ai/ai.service';
import { LeadsService } from '../leads/leads.service';
import { Lead, LeadSource } from '../leads/entities/lead.entity';

export interface IncomingMessage {
  channel: ConversationChannel;
  externalId: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: Date;
  metadata?: any;
}

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    @InjectRepository(Conversation)
    private conversationRepository: Repository<Conversation>,
    @InjectRepository(Message)
    private messageRepository: Repository<Message>,
    private whatsappService: WhatsAppService,
    private instagramService: InstagramService,
    private aiService: AiService,
    private leadsService: LeadsService,
  ) {}

  /**
   * Handle incoming message from any channel
   */
  async handleIncomingMessage(message: IncomingMessage): Promise<{
    conversationId: string;
    aiResponse?: string;
  }> {
    // Find or create lead
    let lead = await this.findOrCreateLead(message);

    // Find or create conversation
    let conversation = await this.findOrCreateConversation(lead.id, message);

    // Save incoming message
    const incomingMsg = this.messageRepository.create({
      conversationId: conversation.id,
      sender: MessageSender.LEAD,
      content: message.content,
      externalMessageId: message.externalId,
      status: MessageStatus.DELIVERED,
      deliveredAt: message.timestamp,
    });
    await this.messageRepository.save(incomingMsg);

    // Update conversation
    conversation.messageCount++;
    conversation.lastMessageAt = new Date();
    await this.conversationRepository.save(conversation);

    // Generate AI response
    const aiResponse = await this.generateAIResponse(conversation, lead);

    // Send AI response
    if (aiResponse) {
      await this.sendMessage(conversation.id, aiResponse, MessageSender.AI);
    }

    return {
      conversationId: conversation.id,
      aiResponse,
    };
  }

  /**
   * Find or create lead from incoming message
   */
  private async findOrCreateLead(message: IncomingMessage): Promise<Lead> {
    // Try to find existing lead by phone (WhatsApp) or external ID
    let lead: Lead | null = null;

    if (message.channel === ConversationChannel.WHATSAPP) {
      lead = await this.leadsService.findByPhoneNumber(message.senderId);
    }

    // If not found, create new lead
    if (!lead) {
      const createData: any = {
        firstName: message.senderName?.split(' ')[0] || 'Unknown',
        lastName: message.senderName?.split(' ').slice(1).join(' ') || '',
        email: `${message.senderId}@placeholder.com`, // Will be updated later
        phoneNumber: message.channel === ConversationChannel.WHATSAPP ? message.senderId : '',
        source: message.channel === ConversationChannel.WHATSAPP 
          ? LeadSource.WHATSAPP 
          : LeadSource.INSTAGRAM,
      };

      lead = await this.leadsService.createFromForm(createData);
    }

    return lead;
  }

  /**
   * Find or create conversation
   */
  private async findOrCreateConversation(
    leadId: string,
    message: IncomingMessage,
  ): Promise<Conversation> {
    let conversation = await this.conversationRepository.findOne({
      where: {
        leadId,
        channel: message.channel,
        status: ConversationStatus.ACTIVE,
      },
    });

    if (!conversation) {
      conversation = this.conversationRepository.create({
        leadId,
        channel: message.channel,
        externalId: message.senderId,
        status: ConversationStatus.ACTIVE,
      });
      await this.conversationRepository.save(conversation);
    }

    return conversation;
  }

  /**
   * Generate AI response
   */
  private async generateAIResponse(
    conversation: Conversation,
    lead: Lead,
  ): Promise<string> {
    // Get recent messages for context
    const recentMessages = await this.messageRepository.find({
      where: { conversationId: conversation.id },
      order: { createdAt: 'DESC' },
      take: 10,
    });

    const conversationHistory = recentMessages
      .reverse()
      .map((msg) => ({
        role: msg.sender === MessageSender.LEAD ? ('user' as const) : ('assistant' as const),
        content: msg.content,
      }));

    const aiResponse = await this.aiService.generateChatbotResponse({
      lead,
      conversationHistory,
      channel: conversation.channel as any,
    });

    return aiResponse.text;
  }

  /**
   * Send message
   */
  async sendMessage(
    conversationId: string,
    content: string,
    sender: MessageSender = MessageSender.HUMAN_AGENT,
    senderId?: string,
  ): Promise<Message> {
    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId },
      relations: ['lead'],
    });

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    // Save message
    const message = this.messageRepository.create({
      conversationId,
      sender,
      senderId,
      content,
      status: MessageStatus.PENDING,
    });

    await this.messageRepository.save(message);

    // Send via appropriate channel
    let sent = false;
    try {
      if (conversation.channel === ConversationChannel.WHATSAPP) {
        const result = await this.whatsappService.sendMessage({
          to: conversation.lead.phoneNumber,
          body: content,
        });
        sent = result.success;
      } else if (conversation.channel === ConversationChannel.INSTAGRAM) {
        const result = await this.instagramService.sendMessage({
          recipientId: conversation.externalId,
          message: content,
        });
        sent = result.success;
      }

      // Update status
      message.status = sent ? MessageStatus.SENT : MessageStatus.FAILED;
      if (sent) {
        message.deliveredAt = new Date();
      }
      await this.messageRepository.save(message);
    } catch (error) {
      this.logger.error('Error sending message:', error.message);
      message.status = MessageStatus.FAILED;
      await this.messageRepository.save(message);
    }

    return message;
  }

  /**
   * Get conversation with messages
   */
  async getConversation(id: string): Promise<Conversation & { messages: Message[] }> {
    const conversation = await this.conversationRepository.findOne({
      where: { id },
      relations: ['lead'],
    });

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    const messages = await this.messageRepository.find({
      where: { conversationId: id },
      order: { createdAt: 'ASC' },
    });

    return {
      ...conversation,
      messages,
    } as any;
  }

  /**
   * Get all conversations for a lead
   */
  async getConversationsByLead(leadId: string): Promise<Conversation[]> {
    return this.conversationRepository.find({
      where: { leadId },
      order: { updatedAt: 'DESC' },
    });
  }

  /**
   * Get all conversations with filters
   */
  async findAll(filters: {
    status?: ConversationStatus;
    channel?: ConversationChannel;
    assignedTo?: string;
    requiresAttention?: boolean;
  } = {}): Promise<Conversation[]> {
    const query = this.conversationRepository.createQueryBuilder('conversation')
      .leftJoinAndSelect('conversation.lead', 'lead');

    if (filters.status) {
      query.andWhere('conversation.status = :status', { status: filters.status });
    }

    if (filters.channel) {
      query.andWhere('conversation.channel = :channel', { channel: filters.channel });
    }

    if (filters.assignedTo) {
      query.andWhere('conversation.assignedTo = :assignedTo', { assignedTo: filters.assignedTo });
    }

    if (filters.requiresAttention !== undefined) {
      query.andWhere('conversation.requiresHumanAttention = :requiresAttention', {
        requiresAttention: filters.requiresAttention,
      });
    }

    return query.orderBy('conversation.updatedAt', 'DESC').getMany();
  }

  /**
   * Assign conversation to agent
   */
  async assignTo(id: string, userId: string): Promise<Conversation> {
    const conversation = await this.conversationRepository.findOne({
      where: { id },
    });

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    conversation.assignedTo = userId;
    conversation.requiresHumanAttention = false;

    return this.conversationRepository.save(conversation);
  }

  /**
   * Mark conversation as requiring human attention
   */
  async requestHumanAttention(id: string, reason?: string): Promise<Conversation> {
    const conversation = await this.conversationRepository.findOne({
      where: { id },
    });

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    conversation.requiresHumanAttention = true;
    conversation.context = {
      ...conversation.context,
      nextAction: reason || 'Human assistance requested',
    };

    return this.conversationRepository.save(conversation);
  }

  /**
   * Close conversation
   */
  async closeConversation(id: string): Promise<Conversation> {
    const conversation = await this.conversationRepository.findOne({
      where: { id },
    });

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    conversation.status = ConversationStatus.RESOLVED;

    return this.conversationRepository.save(conversation);
  }

  /**
   * Get conversation statistics
   */
  async getStatistics(): Promise<{
    total: number;
    byChannel: Record<string, number>;
    byStatus: Record<string, number>;
    requiringAttention: number;
  }> {
    const total = await this.conversationRepository.count();

    const byChannel = await this.conversationRepository
      .createQueryBuilder('c')
      .select('c.channel', 'channel')
      .addSelect('COUNT(*)', 'count')
      .groupBy('c.channel')
      .getRawMany();

    const byStatus = await this.conversationRepository
      .createQueryBuilder('c')
      .select('c.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('c.status')
      .getRawMany();

    const requiringAttention = await this.conversationRepository.count({
      where: { requiresHumanAttention: true },
    });

    return {
      total,
      byChannel: byChannel.reduce((acc, curr) => {
        acc[curr.channel] = parseInt(curr.count);
        return acc;
      }, {}),
      byStatus: byStatus.reduce((acc, curr) => {
        acc[curr.status] = parseInt(curr.count);
        return acc;
      }, {}),
      requiringAttention,
    };
  }
}
