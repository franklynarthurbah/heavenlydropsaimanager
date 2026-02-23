/**
 * Conversations Controller
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ConversationStatus, ConversationChannel } from './entities/conversation.entity';

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  findAll(
    @Query('status') status?: ConversationStatus,
    @Query('channel') channel?: ConversationChannel,
    @Query('requiresAttention') requiresAttention?: string,
  ) {
    return this.conversationsService.findAll({
      status,
      channel,
      requiresAttention: requiresAttention === 'true',
    });
  }

  @Get('statistics')
  getStatistics() {
    return this.conversationsService.getStatistics();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.conversationsService.getConversation(id);
  }

  @Post(':id/message')
  sendMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('content') content: string,
    @Body('senderId') senderId: string,
  ) {
    return this.conversationsService.sendMessage(id, content, 'human_agent' as any, senderId);
  }

  @Post(':id/assign')
  assignTo(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.conversationsService.assignTo(id, userId);
  }

  @Post(':id/close')
  close(@Param('id', ParseUUIDPipe) id: string) {
    return this.conversationsService.closeConversation(id);
  }

  @Post(':id/request-human')
  requestHuman(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('reason') reason?: string,
  ) {
    return this.conversationsService.requestHumanAttention(id, reason);
  }
}
