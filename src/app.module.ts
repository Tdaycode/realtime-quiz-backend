import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { RedisModule } from './modules/redis/redis.module';
import { LobbyModule } from './modules/lobby/lobby.module';
import { GameModule } from './modules/game/game.module';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { HistoryModule } from './modules/history/history.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { RateLimitModule } from './modules/rate-limit/rate-limit.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    RedisModule,
    AuthModule,
    UserModule,
    LobbyModule,
    GameModule,
    HistoryModule,
    AnalyticsModule,
    RateLimitModule,
  ],
})
export class AppModule {}
