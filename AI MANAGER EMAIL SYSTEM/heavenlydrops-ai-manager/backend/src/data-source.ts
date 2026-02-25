/**
 * TypeORM Data Source Configuration
 * 
 * Used for CLI migrations and database operations.
 */

import { DataSource } from 'typeorm';
import { config } from 'dotenv';

// Load environment variables
config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  username: process.env.DB_USERNAME || 'heavenlydrops',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_NAME || 'heavenlydrops_db',
  entities: ['src/**/*.entity.ts'],
  migrations: ['database/migrations/*.ts'],
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});
