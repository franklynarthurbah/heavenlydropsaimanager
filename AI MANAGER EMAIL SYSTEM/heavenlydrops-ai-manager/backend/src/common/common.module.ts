/**
 * Common Module
 * 
 * Shared utilities and public endpoints.
 */

import { Module } from '@nestjs/common';
import { PublicController } from './public.controller';
import { LeadsModule } from '../leads/leads.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [
    LeadsModule,
    ConversationsModule,
    IntegrationsModule,
    JobsModule,
  ],
  controllers: [PublicController],
})
export class CommonModule {}
