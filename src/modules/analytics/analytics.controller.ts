/* eslint-disable @typescript-eslint/no-unsafe-call */
import { Controller, Get, UseGuards, Query } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AnalyticsService } from './analytics.service';
import { Throttle } from '@nestjs/throttler';

@Controller('analytics')
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  @Get('dashboard')
  @UseGuards(AuthGuard('jwt'))
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 requests per minute
  async getDashboard() {
    return this.analyticsService.getDashboardData();
  }

  @Get('system')
  @UseGuards(AuthGuard('jwt'))
  async getSystemMetrics() {
    return this.analyticsService.getSystemMetrics();
  }

  @Get('games')
  async getGameMetrics() {
    return this.analyticsService.getGameMetrics();
  }

  @Get('players')
  async getPlayerMetrics() {
    return this.analyticsService.getPlayerMetrics();
  }

  @Get('historical')
  async getHistoricalData(@Query('days') days?: string) {
    const numDays = days ? parseInt(days) : 7;
    return this.analyticsService.getHistoricalData(numDays);
  }
}
