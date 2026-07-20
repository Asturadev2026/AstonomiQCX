import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AgentBuilderModule } from './agent-builder/agent-builder.module';
import { ActivityModule } from './activity/activity.module';
import { AiModule } from './ai/ai.module';
import { AiPersonaModule } from './ai-persona/ai-persona.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AppController } from './app.controller';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { AutomationsModule } from './automations/automations.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { ContactCentreModule } from './contact-centre/contact-centre.module';
import { ContactsModule } from './contacts/contacts.module';
import { ConversationsModule } from './conversations/conversations.module';
import { DepartmentsModule } from './departments/departments.module';
import { FieldServiceModule } from './field-service/field-service.module';
import { JourneyModule } from './journey/journey.module';
import { KbModule } from './kb/kb.module';
import { MacrosModule } from './macros/macros.module';
import { MentionsModule } from './mentions/mentions.module';
import { NavModule } from './nav/nav.module';
import { PortalModule } from './portal/portal.module';
import { PriorityMatrixModule } from './priority-matrix/priority-matrix.module';
import { QaModule } from './qa/qa.module';
import { RealtimeModule } from './realtime/realtime.module';
import { SlaModule } from './sla/sla.module';
import { SurveysModule } from './surveys/surveys.module';
import { TelephonyModule } from './telephony/telephony.module';
import { TenantMiddleware } from './tenancy/tenant.middleware';
import { TicketsModule } from './tickets/tickets.module';
import { VoiceModule } from './voice/voice.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { WorkforceModule } from './workforce/workforce.module';

@Module({
  imports: [
    AuditModule,
    RealtimeModule,
    SlaModule,
    AuthModule,
    AutomationsModule,
    ContactCentreModule,
    ContactsModule,
    ConversationsModule,
    DepartmentsModule,
    FieldServiceModule,
    JourneyModule,
    TicketsModule,
    KbModule,
    MacrosModule,
    AiModule,
    AiPersonaModule,
    SurveysModule,
    CampaignsModule,
    PortalModule,
    QaModule,
    AnalyticsModule,
    WhatsappModule,
    VoiceModule,
    AgentBuilderModule,
    WorkforceModule,
    TelephonyModule,
    PriorityMatrixModule,
    ActivityModule,
    NavModule,
    MentionsModule,
  ],
  controllers: [AppController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).exclude('health').forRoutes('*');
  }
}
