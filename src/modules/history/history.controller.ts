/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Controller, Get, Param, UseGuards, Req, Query } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { HistoryService } from './history.service';

@Controller('history')
export class HistoryController {
  constructor(private historyService: HistoryService) {}

  @Get('my-games')
  @UseGuards(AuthGuard('jwt'))
  async getMyGames(@Req() req, @Query('limit') limit?: string) {
    return this.historyService.getUserGames(
      req.user.userId,
      limit ? parseInt(limit) : 20,
    );
  }

  @Get('my-stats')
  @UseGuards(AuthGuard('jwt'))
  async getMyStats(@Req() req) {
    return this.historyService.getUserStats(req.user.userId);
  }

  @Get('recent')
  async getRecentGames(@Query('limit') limit?: string) {
    return this.historyService.getRecentGames(limit ? parseInt(limit) : 50);
  }

  @Get('game/:gameId')
  async getGame(@Param('gameId') gameId: string) {
    return this.historyService.getGameById(gameId);
  }

  @Get('user/:userId/stats')
  async getUserStats(@Param('userId') userId: string) {
    return this.historyService.getUserStats(userId);
  }
}
