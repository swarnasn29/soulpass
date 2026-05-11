-- SoulPass off-chain mirror.
-- Run this in the Supabase SQL editor on a fresh project.
-- All auth/authz happens at the Next.js API layer via Privy — RLS stays off.

create table if not exists events (
  address              text primary key,
  organizer            text not null,
  event_id             text not null,
  title                text not null,
  description          text not null default '',
  cover                text not null default '',
  cover_ar_uri         text,
  venue_image          text not null default '',
  venue_image_ar_uri   text,
  metadata_uri         text,
  location             text not null default '',
  start_ts             bigint not null,
  end_ts               bigint not null,
  capacity             int not null,
  tags                 jsonb not null default '[]'::jsonb,
  questions            jsonb not null default '[]'::jsonb,
  contact_fields       jsonb not null default '[]'::jsonb,
  min_reputation       int,
  match_schema         jsonb,
  status               text not null default 'published' check (status in ('draft','published')),
  created_at           bigint not null
);

create index if not exists idx_events_organizer on events (organizer);
create index if not exists idx_events_status_start on events (status, start_ts);

create table if not exists users (
  authority      text primary key,
  name           text not null,
  avatar         text not null,
  avatar_ar_uri  text,
  email          text,
  bio            text,
  created_at     bigint not null
);

create table if not exists registrations (
  event_address     text not null,
  attendee_address  text not null,
  status            text not null check (status in ('pending','approved','declined')),
  registered_at     bigint not null,
  decided_at        bigint,
  answers           jsonb,
  contact           jsonb,
  primary key (event_address, attendee_address)
);

create index if not exists idx_reg_event on registrations (event_address);
create index if not exists idx_reg_attendee on registrations (attendee_address);

create table if not exists user_traits (
  authority  text primary key,
  data       jsonb not null default '{}'::jsonb,
  updated_at bigint not null
);
