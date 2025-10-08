import { Module } from '@nestjs/common';
import { LobbyGateway } from './lobby.gateway';
import { LobbyService } from './lobby.service';
import { GameModule } from '../game/game.module';
import { AnalyticsService } from '../analytics/analytics.service';

@Module({
  imports: [GameModule],
  providers: [LobbyGateway, LobbyService, AnalyticsService],
  exports: [LobbyService],
})
export class LobbyModule {}
