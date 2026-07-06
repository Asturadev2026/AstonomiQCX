-- Row-Level Security — the tenant-isolation safety net (Guide §7).
--
-- Notes:
-- • FORCE ROW LEVEL SECURITY is essential: without it the table OWNER (our app
--   role in dev) bypasses all policies and isolation silently does nothing.
-- • Consequence: EVERY query must run inside withTenant() which does
--   SET LOCAL app.tenant. Seeds included. A query without it returns 0 rows.
-- • plans has no tenant_id (global catalogue) — excluded.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'roles','departments','teams','users',
    'contacts','orders','conversations','messages','tickets',
    'business_hours','sla_policies','sla_events','escalation_rules','escalations',
    'kb_articles','kb_embeddings','macros','agent_flows','rules',
    'channels','numbers','calls','queues',
    'campaigns','surveys','service_visits','qa_audits',
    'audit_logs','subscriptions',
    'agent_status','shifts','social_mentions','notifications',
    'invoices','invites','tenant_settings','ref_counters'
  ]
  LOOP
    EXECUTE format('alter table %I enable row level security', t);
    EXECUTE format('alter table %I force row level security', t);
    EXECUTE format(
      'create policy tenant_isolation on %I
         using (tenant_id = current_setting(''app.tenant'', true)::uuid)
         with check (tenant_id = current_setting(''app.tenant'', true)::uuid)', t);
  END LOOP;
END $$;

-- Indexes Prisma cannot express -------------------------------------------

-- SLA sweep hot path: open (unmet) events due before now (Guide §6)
create index if not exists sla_events_open_due
  on sla_events (tenant_id, target_at) where met_at is null;

-- Vector search for RAG (Guide §6/§11). Rebuild with more lists as data grows.
create index if not exists kb_embeddings_ivfflat
  on kb_embeddings using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Global search (Plan §5.5): trigram indexes for ILIKE
create extension if not exists pg_trgm;
create index if not exists contacts_name_trgm on contacts using gin (name gin_trgm_ops);
create index if not exists tickets_subject_trgm on tickets using gin (subject gin_trgm_ops);
create index if not exists orders_ext_ref_trgm on orders using gin (ext_ref gin_trgm_ops);