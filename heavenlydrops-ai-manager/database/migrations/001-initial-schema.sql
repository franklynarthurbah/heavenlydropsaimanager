-- ============================================
-- Initial Database Schema
-- Heavenly Drops AI Manager
-- ============================================

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'agent',
    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMP,
    avatar_url VARCHAR(255),
    phone_number VARCHAR(20),
    notification_preferences JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Leads table
CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone_number VARCHAR(20) NOT NULL,
    country VARCHAR(100),
    age INTEGER,
    interest_type VARCHAR(50) DEFAULT 'other',
    notes TEXT,
    status VARCHAR(50) DEFAULT 'new',
    source VARCHAR(50) DEFAULT 'website_form',
    referral_code VARCHAR(255),
    qualification_data JSONB,
    ai_interaction_count INTEGER DEFAULT 0,
    last_contacted_at TIMESTAMP,
    next_follow_up_at TIMESTAMP,
    assigned_to UUID,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    channel VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'active',
    external_id VARCHAR(255),
    external_thread_id VARCHAR(255),
    ai_summary TEXT,
    ai_tags JSONB,
    message_count INTEGER DEFAULT 0,
    last_message_at TIMESTAMP,
    assigned_to UUID,
    requires_human_attention BOOLEAN DEFAULT false,
    context JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender VARCHAR(50) NOT NULL,
    sender_id UUID,
    content TEXT NOT NULL,
    attachments JSONB,
    status VARCHAR(50) DEFAULT 'pending',
    external_message_id VARCHAR(255),
    ai_prompt TEXT,
    ai_response_raw TEXT,
    ai_metadata JSONB,
    delivered_at TIMESTAMP,
    read_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Call logs table
CREATE TABLE IF NOT EXISTS call_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    direction VARCHAR(50) DEFAULT 'outbound',
    status VARCHAR(50) DEFAULT 'scheduled',
    phone_number VARCHAR(50) NOT NULL,
    external_call_id VARCHAR(255),
    duration_seconds INTEGER,
    transcript TEXT,
    ai_summary TEXT,
    ai_extracted_data JSONB,
    recording_urls JSONB,
    conversation_flow JSONB,
    started_at TIMESTAMP,
    ended_at TIMESTAMP,
    scheduled_for TIMESTAMP,
    retry_count INTEGER DEFAULT 0,
    error_message TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Email logs table
CREATE TABLE IF NOT EXISTS email_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID,
    direction VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    type VARCHAR(50) NOT NULL,
    from_address VARCHAR(255) NOT NULL,
    to_address VARCHAR(255) NOT NULL,
    cc VARCHAR(255),
    bcc VARCHAR(255),
    subject VARCHAR(500) NOT NULL,
    body_html TEXT NOT NULL,
    body_text TEXT,
    attachments JSONB,
    external_message_id VARCHAR(255),
    thread_id VARCHAR(255),
    ai_generated_content TEXT,
    ai_approved BOOLEAN DEFAULT false,
    approved_by UUID,
    sent_at TIMESTAMP,
    opened_at TIMESTAMP,
    clicked_at TIMESTAMP,
    tracking_data JSONB,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Appointments table
CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'scheduled',
    type VARCHAR(50) DEFAULT 'consultation',
    scheduled_at TIMESTAMP NOT NULL,
    duration_minutes INTEGER DEFAULT 30,
    timezone VARCHAR(100) DEFAULT 'UTC',
    notes TEXT,
    internal_notes TEXT,
    teams_meeting_id VARCHAR(255),
    teams_join_url TEXT,
    teams_calendar_event_id VARCHAR(255),
    teams_attendees JSONB,
    assigned_to UUID NOT NULL,
    staff_attendees JSONB,
    send_reminders BOOLEAN DEFAULT true,
    reminder_log JSONB,
    customer_confirmed BOOLEAN DEFAULT false,
    customer_confirmed_at TIMESTAMP,
    customer_confirmation_method VARCHAR(255),
    ai_scheduling_data JSONB,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Knowledge documents table
CREATE TABLE IF NOT EXISTS knowledge_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    document_type VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    summary TEXT,
    source_url VARCHAR(500) NOT NULL,
    source_section VARCHAR(100),
    status VARCHAR(50) DEFAULT 'active',
    keywords JSONB,
    embeddings JSONB,
    usage_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMP,
    content_hash VARCHAR(64),
    fetched_at TIMESTAMP NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Integration credentials table
CREATE TABLE IF NOT EXISTS integration_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    integration_type VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    credentials TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'active',
    webhook_url VARCHAR(255),
    webhook_secret VARCHAR(255),
    expires_at TIMESTAMP,
    last_used_at TIMESTAMP,
    last_error_at TIMESTAMP,
    last_error_message TEXT,
    rate_limits JSONB,
    metadata JSONB,
    is_default BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone_number);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_conversations_lead_id ON conversations(lead_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_lead_id ON call_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_lead_id ON email_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_appointments_lead_id ON appointments(lead_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_type ON knowledge_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_status ON knowledge_documents(status);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON leads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_call_logs_updated_at BEFORE UPDATE ON call_logs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_email_logs_updated_at BEFORE UPDATE ON email_logs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON appointments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_knowledge_docs_updated_at BEFORE UPDATE ON knowledge_documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_integration_credentials_updated_at BEFORE UPDATE ON integration_credentials
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
