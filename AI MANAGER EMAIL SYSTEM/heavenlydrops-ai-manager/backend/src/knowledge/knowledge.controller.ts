/**
 * Knowledge Controller
 * 
 * Admin endpoints for managing knowledge documents.
 */

import {
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  ParseUUIDPipe,
  Param,
} from '@nestjs/common';
import { KnowledgeService } from './knowledge.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('knowledge')
@UseGuards(JwtAuthGuard)
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Get()
  findAll() {
    return this.knowledgeService.getAllDocuments();
  }

  @Get('search')
  search(@Query('q') query: string) {
    return this.knowledgeService.searchDocuments(query);
  }

  @Get('sync')
  async syncAll() {
    return this.knowledgeService.syncAllSources();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    // Implement find by ID if needed
    return { message: 'Document retrieval not implemented' };
  }
}
