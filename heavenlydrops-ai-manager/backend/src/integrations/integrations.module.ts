/**
 * Integrations Module
 * 
 * Aggregates all external service integrations.
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { IntegrationCredential } from './entities/integration-credential.entity';
import { WhatsAppService } from './whatsapp.service';
import { InstagramService } from './instagram.service';
import { EmailService } from './email.service';
import { VoiceService } from './voice.service';
import { MicrosoftTeamsService } from './microsoft-teams.service';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([IntegrationCredential]),
    HttpModule,
    AiModule,
  ],
  providers: [
    WhatsAppService,
    InstagramService,
    EmailService,
    VoiceService,
    MicrosoftTeamsService,
  ],
  exports: [
    WhatsAppService,
    InstagramService,
    EmailService,
    VoiceService,
    MicrosoftTeamsService,
  ],
})
export class IntegrationsModule {}
