import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AiModule } from './ai/ai.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AppController } from './app.controller';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { ContactsModule } from './contacts/contacts.module';
import { JourneyModule } from './journey/journey.module';
import { KbModule } from './kb/kb.module';
import { PortalModule } from './portal/portal.module';
import { QaModule } from './qa/qa.module';
import { RealtimeModule } from './realtime/realtime.module';
import { SlaModule } from './sla/sla.module';
import { SurveysModule } from './surveys/surveys.module';
import { TenantMiddleware } from './tenancy/tenant.middleware';
import { TicketsModule } from './tickets/tickets.module';

@Module({
  imports: [
    AuditModule,
    RealtimeModule,
    SlaModule,
    AuthModule,
    ContactsModule,
    JourneyModule,
    TicketsModule,
    KbModule,
    AiModule,
    SurveysModule,
    CampaignsModule,
    PortalModule,
    QaModule,
    AnalyticsModule,
  ],
  controllers: [AppController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).exclude('health').forRoutes('*');
  }
}
