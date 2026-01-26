import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QueueService } from './queue.service';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const redisHost = configService.get<string>('REDIS_HOST', 'localhost');
        const redisPort = configService.get<number>('REDIS_PORT', 6379);
        const redisPassword = configService.get<string>('REDIS_PASSWORD');
        const redisUrl = configService.get<string>('REDIS_URL');

        // Use REDIS_URL if provided (Railway, Heroku, etc.), otherwise construct from host/port
        const connection = redisUrl
          ? { url: redisUrl }
          : {
              host: redisHost,
              port: redisPort,
              ...(redisPassword && { password: redisPassword }),
            };

        return {
          connection: {
            ...connection,
            // BullMQ requires maxRetriesPerRequest to be null
            maxRetriesPerRequest: null,
            retryStrategy: (times: number) => {
              // Exponential backoff: 50ms, 100ms, 200ms, 400ms, etc.
              const delay = Math.min(times * 50, 2000);
              return delay;
            },
            // Connection timeout
            connectTimeout: 10000,
            // Enable offline queue (queue commands when disconnected)
            enableOfflineQueue: true,
          },
          defaultJobOptions: {
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 2000,
            },
            removeOnComplete: {
              age: 24 * 3600, // Keep completed jobs for 24 hours
              count: 1000, // Keep max 1000 completed jobs
            },
            removeOnFail: {
              age: 7 * 24 * 3600, // Keep failed jobs for 7 days
            },
          },
        };
      },
    }),
    BullModule.registerQueue({
      name: 'ocr',
    }),
  ],
  providers: [QueueService],
  exports: [BullModule, QueueService],
})
export class QueueModule {}
