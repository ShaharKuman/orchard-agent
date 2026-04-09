-- OrchardAgent Database Schema
-- Run this in Supabase SQL Editor

-- Messages table - all WhatsApp conversations
CREATE TABLE messages (
  id            BIGSERIAL PRIMARY KEY,
  from_phone    TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content       TEXT NOT NULL,
  message_type  TEXT DEFAULT 'text',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_phone ON messages(from_phone);
CREATE INDEX idx_messages_created ON messages(created_at);

-- Knowledge records - structured agricultural data
CREATE TABLE knowledge_records (
  id            BIGSERIAL PRIMARY KEY,
  source_phone  TEXT NOT NULL,
  action        TEXT,
  timing        TEXT,
  plot          TEXT,
  variety       TEXT,
  materials     TEXT,
  supplier      TEXT,
  cost          TEXT,
  nuances       TEXT,
  approved      BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_records_approved ON knowledge_records(approved);
CREATE INDEX idx_records_created ON knowledge_records(created_at);

-- Insights - web search findings vs Avik's methods
CREATE TABLE insights (
  id            BIGSERIAL PRIMARY KEY,
  source_phone  TEXT NOT NULL,
  topic         TEXT,
  avik_method   TEXT,
  alternative   TEXT,
  reviewed      BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Pending questions from Tomer/Shahar to ask Avik
CREATE TABLE pending_questions (
  id            BIGSERIAL PRIMARY KEY,
  asked_by      TEXT NOT NULL,
  question      TEXT NOT NULL,
  asked         BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
