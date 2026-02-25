/**
 * Heavenly Drops AI Manager - Main Application Entry Point
 * 
 * This is the bootstrap file for the NestJS application.
 * Configures global pipes, CORS, and starts the HTTP server.
 * 
 * @author Heavenly Drops
 * @version 1.0.0
 */

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Enable CORS for frontend access
  app.enableCors({
    origin: configService.get('FRONTEND_URL') || 'http://localhost:5173',
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Accept, Authorization',
  });

  // Global validation pipe
  app.useGlobalPipe(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: {
      enableImplicitConversion: true,
    },
  }));

  // Global API prefix
  app.setGlobalPrefix('api');

  const port = configService.get('PORT') || 3000;
  
  await app.listen(port);
  
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║           Heavenly Drops AI Manager - Backend                  ║
║                                                                ║
║  🚀 Server running on: http://localhost:${port}                   ║
║  📚 API Documentation: http://localhost:${port}/api              ║
║  🔧 Environment: ${configService.get('NODE_ENV') || 'development'}                    ║
╚════════════════════════════════════════════════════════════════╝
  `);
}

bootstrap();
