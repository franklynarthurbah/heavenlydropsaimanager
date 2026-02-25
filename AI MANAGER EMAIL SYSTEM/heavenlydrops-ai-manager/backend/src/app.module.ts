/**
 * App Module - Root Module
 * 
 * Configures all application modules, database connection,
 * Redis connection, and scheduled tasks.
 */

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';

// Feature Modules
import { AuthModule } from './auth/auth.module';
import { LeadsModule } from './leads/leads.module';
import { ConversationsModule } from './conversations/conversations.module';
import { CallsModule } from './calls/calls.module';
import { EmailsModule } from './emails/emails.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { AiModule } from './ai/ai.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { JobsModule } from './jobs/jobs.module';
import { CommonModule } from './common/common.module';

// Entities
import { User } from './auth/entities/user.entity';
import { Lead } from './leads/entities/lead.entity';
import { Conversation } from './conversations/entities/conversation.entity';
import { Message } from './conversations/entities/message.entity';
import { CallLog } from './calls/entities/call-log.entity';
import { EmailLog } from './emails/entities/email-log.entity';
import { Appointment } from './appointments/entities/appointment.entity';
import { KnowledgeDocument } from './knowledge/entities/knowledge-document.entity';
import { IntegrationCredential } from './integrations/entities/integration-credential.entity';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local', '.env.production'],
    }),

    // Database Configuration
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DB_HOST', 'localhost'),
        port: configService.get('DB_PORT', 5432),
        username: configService.get('DB_USERNAME', 'heavenlydrops'),
        password: configService.get('DB_PASSWORD', 'password'),
        database: configService.get('DB_NAME', 'heavenlydrops_db'),
        entities: [
          User,
          Lead,
          Conversation,
          Message,
          CallLog,
          EmailLog,
          Appointment,
          KnowledgeDocument,
          IntegrationCredential,
        ],
        synchronize: configService.get('NODE_ENV') !== 'production',
        logging: configService.get('NODE_ENV') === 'development',
        ssl: configService.get('DB_SSL') === 'true' ? { rejectUnauthorized: false } : false,
      }),
      inject: [ConfigService],
    }),

    // Redis/BullMQ Configuration for Background Jobs
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get('REDIS_HOST', 'localhost'),
          port: configService.get('REDIS_PORT', 6379),
          password: configService.get('REDIS_PASSWORD'),
        },
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      }),
      inject: [ConfigService],
    }),

    // Scheduled Tasks
    ScheduleModule.forRoot(),

    // Feature Modules
    AuthModule,
    LeadsModule,
    ConversationsModule,
    CallsModule,
    EmailsModule,
    AppointmentsModule,
    AiModule,
    IntegrationsModule,
    KnowledgeModule,
    JobsModule,
    CommonModule,
  ],
})
export class AppModule {}
