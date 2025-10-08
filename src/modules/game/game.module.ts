import { Module } from '@nestjs/common';
import { GameService } from './game.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { UserService } from '../user/user.service';
import { HistoryService } from '../history/history.service';

@Module({
  providers: [GameService, AnalyticsService, UserService, HistoryService],
  exports: [GameService],
})
export class GameModule {}
