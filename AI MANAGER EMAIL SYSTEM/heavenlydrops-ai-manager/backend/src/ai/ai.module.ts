/**
 * AI Module
 * 
 * Configures AI services and integrations.
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiService } from './ai.service';
import { KnowledgeModule } from '../knowledge/knowledge.module';

@Module({
  imports: [ConfigModule, KnowledgeModule],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
