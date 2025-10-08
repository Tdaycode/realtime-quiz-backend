import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { RedisService } from './modules/redis/redis.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly redisService: RedisService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('/health')
  async healthCheck() {
    const redisOk = (await this.redisService.ping()) === 'PONG';
    return {
      status: redisOk ? 'healthy' : 'degraded',
      redis: redisOk,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    };
  }
}
