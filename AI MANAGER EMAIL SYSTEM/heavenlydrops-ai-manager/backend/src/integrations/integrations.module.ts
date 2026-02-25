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
import { WhatsAppClassifierService } from './whatsapp-classifier.service';
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
    WhatsAppClassifierService,
  ],
  exports: [
    WhatsAppService,
    InstagramService,
    EmailService,
    VoiceService,
    MicrosoftTeamsService,
    WhatsAppClassifierService,
  ],
})
export class IntegrationsModule {}
