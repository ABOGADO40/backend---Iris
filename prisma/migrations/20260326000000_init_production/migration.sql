-- =====================================================
-- SISTEMA IRIS - Migración Consolidada de Producción
-- Fecha: 2026-03-26
-- Genera las 28 tablas del schema.prisma desde cero
-- =====================================================

-- ==========================
-- 1. CREATE TABLES
-- ==========================

-- CreateTable
CREATE TABLE "roles" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "description" VARCHAR(200),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(200),
    "type" VARCHAR(30),
    "resource" VARCHAR(100),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles_permissions" (
    "id" SERIAL NOT NULL,
    "role_id" INTEGER NOT NULL,
    "permission_id" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),

    CONSTRAINT "roles_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "role_id" INTEGER NOT NULL,
    "email" VARCHAR(160) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "full_name" VARCHAR(160),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),
    "email_verified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cases" (
    "id" SERIAL NOT NULL,
    "owner_user_id" INTEGER NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "case_date" DATE NOT NULL,
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),
    "description_file_path" VARCHAR(500),
    "description_file_name" VARCHAR(255),
    "description_file_mime" VARCHAR(120),
    "description_file_size" BIGINT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidences" (
    "id" SERIAL NOT NULL,
    "owner_user_id" INTEGER NOT NULL,
    "evidence_type" VARCHAR(10) NOT NULL,
    "title" VARCHAR(200),
    "tipo_evidencia" VARCHAR(120),
    "notes" TEXT,
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),

    CONSTRAINT "evidences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_evidences" (
    "id" SERIAL NOT NULL,
    "case_id" INTEGER NOT NULL,
    "evidence_id" INTEGER NOT NULL,
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),

    CONSTRAINT "case_evidences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_files" (
    "id" SERIAL NOT NULL,
    "evidence_id" INTEGER NOT NULL,
    "original_filename" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(120),
    "size_bytes" BIGINT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "checksum_sha256" VARCHAR(64),
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),
    "is_processed" BOOLEAN DEFAULT false,
    "content_type" VARCHAR(100),

    CONSTRAINT "evidence_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_texts" (
    "id" SERIAL NOT NULL,
    "evidence_id" INTEGER NOT NULL,
    "text_content" TEXT NOT NULL,
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),

    CONSTRAINT "evidence_texts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_requests" (
    "id" SERIAL NOT NULL,
    "requester_user_id" INTEGER NOT NULL,
    "service_type" VARCHAR(30) NOT NULL,
    "evidence_id" INTEGER,
    "case_id" INTEGER,
    "evidence_id_b" INTEGER,
    "input_free_text" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "error_message" TEXT,
    "ai_provider" VARCHAR(60),
    "ai_model" VARCHAR(80),
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),
    "is_saved" BOOLEAN DEFAULT false,
    "title" VARCHAR(200),
    "input_tokens" INTEGER DEFAULT 0,
    "output_tokens" INTEGER DEFAULT 0,
    "total_tokens" INTEGER DEFAULT 0,
    "estimated_cost" DECIMAL(10,6) DEFAULT 0,

    CONSTRAINT "analysis_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_results" (
    "id" SERIAL NOT NULL,
    "analysis_request_id" INTEGER NOT NULL,
    "result_text" TEXT NOT NULL,
    "result_structured_json" JSONB,
    "disclaimer_included" BOOLEAN NOT NULL DEFAULT true,
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),

    CONSTRAINT "analysis_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" SERIAL NOT NULL,
    "owner_user_id" INTEGER NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "color" VARCHAR(7),
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_tags" (
    "id" SERIAL NOT NULL,
    "case_id" INTEGER NOT NULL,
    "tag_id" INTEGER NOT NULL,
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),

    CONSTRAINT "case_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_tags" (
    "id" SERIAL NOT NULL,
    "evidence_id" INTEGER NOT NULL,
    "tag_id" INTEGER NOT NULL,
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),

    CONSTRAINT "evidence_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exports" (
    "id" SERIAL NOT NULL,
    "analysis_result_id" INTEGER NOT NULL,
    "format" VARCHAR(10) NOT NULL,
    "storage_path" TEXT NOT NULL,
    "file_size_bytes" BIGINT,
    "download_count" INTEGER NOT NULL DEFAULT 0,
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),

    CONSTRAINT "exports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" SERIAL NOT NULL,
    "actor_user_id" INTEGER,
    "action_code" VARCHAR(80) NOT NULL,
    "entity_type" VARCHAR(50),
    "entity_id" INTEGER,
    "details" JSONB,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_service_configs" (
    "id" SERIAL NOT NULL,
    "service_type" VARCHAR(30) NOT NULL,
    "service_name" VARCHAR(100) NOT NULL,
    "service_description" VARCHAR(300),
    "api_key_encrypted" VARCHAR(500),
    "api_url" VARCHAR(500) DEFAULT 'https://api.openai.com/v1/chat/completions',
    "ai_model" VARCHAR(80) DEFAULT 'gpt-4o',
    "max_tokens" INTEGER DEFAULT 4096,
    "temperature" DECIMAL(3,2) DEFAULT 0.7,
    "is_active" BOOLEAN DEFAULT false,
    "prompt_id" VARCHAR(100),
    "prompt_version" VARCHAR(10) DEFAULT '1',
    "use_responses_api" BOOLEAN DEFAULT false,
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),

    CONSTRAINT "ai_service_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_messages" (
    "id" SERIAL NOT NULL,
    "analysis_request_id" INTEGER NOT NULL,
    "role" VARCHAR(20) NOT NULL,
    "content" TEXT NOT NULL,
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analysis_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_documents" (
    "id" SERIAL NOT NULL,
    "evidence_file_id" INTEGER NOT NULL,
    "extracted_text" TEXT,
    "processing_status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "error_message" TEXT,
    "metadata" JSONB DEFAULT '{}',
    "processing_time_ms" INTEGER,
    "ocr_confidence" DECIMAL(5,2),
    "word_count" INTEGER,
    "page_count" INTEGER,
    "has_images" BOOLEAN DEFAULT false,
    "date_time_registration" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date_time_updated" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extracted_images" (
    "id" SERIAL NOT NULL,
    "processed_document_id" INTEGER NOT NULL,
    "image_base64" TEXT,
    "mime_type" VARCHAR(50),
    "page_number" INTEGER,
    "image_index" INTEGER,
    "ocr_text" TEXT,
    "ocr_confidence" DECIMAL(5,2),
    "width" INTEGER,
    "height" INTEGER,
    "file_size_bytes" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "extracted_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_chats" (
    "id" SERIAL NOT NULL,
    "evidence_id" INTEGER NOT NULL,
    "chat_type" VARCHAR(20),
    "participants" JSONB DEFAULT '[]',
    "total_messages" INTEGER DEFAULT 0,
    "date_range_start" TIMESTAMPTZ(6),
    "date_range_end" TIMESTAMPTZ(6),
    "storage_path" VARCHAR(500),
    "has_media" BOOLEAN DEFAULT false,
    "media_count" INTEGER DEFAULT 0,
    "formatted_text" TEXT,
    "processing_status" VARCHAR(20) DEFAULT 'PENDING',
    "error_message" TEXT,
    "date_time_registration" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date_time_updated" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_chats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_messages" (
    "id" SERIAL NOT NULL,
    "whatsapp_chat_id" INTEGER NOT NULL,
    "sender" VARCHAR(255),
    "message_text" TEXT,
    "message_timestamp" TIMESTAMPTZ(6),
    "has_media" BOOLEAN DEFAULT false,
    "media_type" VARCHAR(50),
    "media_path" VARCHAR(500),
    "message_index" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transcriptions" (
    "id" SERIAL NOT NULL,
    "evidence_file_id" INTEGER NOT NULL,
    "transcription_text" TEXT,
    "transcription_language" VARCHAR(10),
    "duration_seconds" INTEGER,
    "processing_status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "whisper_model" VARCHAR(50) DEFAULT 'whisper-1',
    "has_timestamps" BOOLEAN DEFAULT false,
    "timestamps_json" JSONB,
    "error_message" TEXT,
    "cost_usd" DECIMAL(10,4),
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),

    CONSTRAINT "transcriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_frames" (
    "id" SERIAL NOT NULL,
    "evidence_file_id" INTEGER NOT NULL,
    "frame_number" INTEGER,
    "timestamp_seconds" DECIMAL(10,3),
    "image_base64" TEXT,
    "vision_analysis" TEXT,
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "video_frames_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verifications" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "pin" VARCHAR(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "date_time_registration" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_config_variables" (
    "id" SERIAL NOT NULL,
    "service_type" VARCHAR(30) NOT NULL,
    "internal_key" VARCHAR(100) NOT NULL,
    "prompt_var_name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(200),
    "display_order" INTEGER DEFAULT 0,

    CONSTRAINT "ai_config_variables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token_usage" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "service_type" VARCHAR(20) NOT NULL,
    "request_id" INTEGER,
    "case_id" INTEGER,
    "input_tokens" INTEGER DEFAULT 0,
    "output_tokens" INTEGER DEFAULT 0,
    "total_tokens" INTEGER DEFAULT 0,
    "ai_model" VARCHAR(80),
    "ai_provider" VARCHAR(60) DEFAULT 'openai',
    "estimated_cost" DECIMAL(10,6) DEFAULT 0,
    "audio_duration_seconds" DECIMAL(10,2),
    "call_type" VARCHAR(20) DEFAULT 'primary',
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "token_usage_pkey" PRIMARY KEY ("id")
);

-- ==========================
-- 2. UNIQUE INDEXES
-- ==========================

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "roles_permissions_role_id_permission_id_key" ON "roles_permissions"("role_id", "permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "case_evidences_case_id_evidence_id_key" ON "case_evidences"("case_id", "evidence_id");

-- CreateIndex
CREATE UNIQUE INDEX "evidence_files_evidence_id_key" ON "evidence_files"("evidence_id");

-- CreateIndex
CREATE UNIQUE INDEX "evidence_texts_evidence_id_key" ON "evidence_texts"("evidence_id");

-- CreateIndex
CREATE UNIQUE INDEX "analysis_results_analysis_request_id_key" ON "analysis_results"("analysis_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "tags_owner_user_id_name_key" ON "tags"("owner_user_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "case_tags_case_id_tag_id_key" ON "case_tags"("case_id", "tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "evidence_tags_evidence_id_tag_id_key" ON "evidence_tags"("evidence_id", "tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_service_configs_service_type_key" ON "ai_service_configs"("service_type");

-- CreateIndex
CREATE UNIQUE INDEX "processed_documents_evidence_file_id_key" ON "processed_documents"("evidence_file_id");

-- CreateIndex
CREATE UNIQUE INDEX "transcriptions_evidence_file_id_key" ON "transcriptions"("evidence_file_id");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_chats_evidence_id_key" ON "whatsapp_chats"("evidence_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_service_internal_key" ON "ai_config_variables"("service_type", "internal_key");

-- ==========================
-- 3. NON-UNIQUE INDEXES
-- ==========================

-- Cases
CREATE INDEX "idx_cases_status" ON "cases"("status");

-- Analysis Requests
CREATE INDEX "idx_analysis_requests_evidence" ON "analysis_requests"("evidence_id");
CREATE INDEX "idx_analysis_requests_saved" ON "analysis_requests"("is_saved");

-- Analysis Messages
CREATE INDEX "idx_analysis_messages_date" ON "analysis_messages"("date_time_registration");
CREATE INDEX "idx_analysis_messages_request" ON "analysis_messages"("analysis_request_id");
CREATE INDEX "idx_analysis_messages_request_id" ON "analysis_messages"("analysis_request_id");

-- Audit Log
CREATE INDEX "audit_log_actor_user_id_idx" ON "audit_log"("actor_user_id");
CREATE INDEX "audit_log_action_code_idx" ON "audit_log"("action_code");
CREATE INDEX "audit_log_entity_type_entity_id_idx" ON "audit_log"("entity_type", "entity_id");
CREATE INDEX "audit_log_date_time_registration_idx" ON "audit_log"("date_time_registration");

-- AI Service Configs
CREATE INDEX "idx_ai_service_configs_active" ON "ai_service_configs"("is_active");
CREATE INDEX "idx_ai_service_configs_prompt" ON "ai_service_configs"("prompt_id");
CREATE INDEX "idx_ai_service_configs_type" ON "ai_service_configs"("service_type");

-- Processed Documents
CREATE INDEX "idx_processed_documents_status" ON "processed_documents"("processing_status");
CREATE INDEX "idx_processed_documents_evidence" ON "processed_documents"("evidence_file_id");

-- Extracted Images
CREATE INDEX "idx_extracted_images_document" ON "extracted_images"("processed_document_id");

-- Whatsapp Chats
CREATE INDEX "idx_whatsapp_chats_evidence" ON "whatsapp_chats"("evidence_id");
CREATE INDEX "idx_whatsapp_chats_status" ON "whatsapp_chats"("processing_status");

-- Whatsapp Messages
CREATE INDEX "idx_whatsapp_messages_chat" ON "whatsapp_messages"("whatsapp_chat_id");
CREATE INDEX "idx_whatsapp_messages_sender" ON "whatsapp_messages"("sender");
CREATE INDEX "idx_whatsapp_messages_timestamp" ON "whatsapp_messages"("message_timestamp");

-- Transcriptions
CREATE INDEX "idx_transcriptions_status" ON "transcriptions"("processing_status");
CREATE INDEX "idx_transcriptions_evidence" ON "transcriptions"("evidence_file_id");

-- Video Frames
CREATE INDEX "idx_video_frames_evidence" ON "video_frames"("evidence_file_id");
CREATE INDEX "idx_video_frames_timestamp" ON "video_frames"("timestamp_seconds");

-- Email Verifications
CREATE INDEX "idx_email_verifications_user_id" ON "email_verifications"("user_id");

-- AI Config Variables
CREATE INDEX "idx_config_vars_service" ON "ai_config_variables"("service_type");

-- Token Usage
CREATE INDEX "idx_token_usage_user" ON "token_usage"("user_id");
CREATE INDEX "idx_token_usage_date" ON "token_usage"("created_at");
CREATE INDEX "idx_token_usage_case" ON "token_usage"("case_id");
CREATE INDEX "idx_token_usage_service" ON "token_usage"("service_type");

-- ==========================
-- 4. FOREIGN KEYS
-- ==========================

-- RolePermission
ALTER TABLE "roles_permissions" ADD CONSTRAINT "roles_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "roles_permissions" ADD CONSTRAINT "roles_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- User
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Session
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Case
ALTER TABLE "cases" ADD CONSTRAINT "cases_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Evidence
ALTER TABLE "evidences" ADD CONSTRAINT "evidences_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CaseEvidence
ALTER TABLE "case_evidences" ADD CONSTRAINT "case_evidences_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "case_evidences" ADD CONSTRAINT "case_evidences_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "evidences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- EvidenceFile
ALTER TABLE "evidence_files" ADD CONSTRAINT "evidence_files_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "evidences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- EvidenceText
ALTER TABLE "evidence_texts" ADD CONSTRAINT "evidence_texts_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "evidences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AnalysisRequest
ALTER TABLE "analysis_requests" ADD CONSTRAINT "analysis_requests_requester_user_id_fkey" FOREIGN KEY ("requester_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "analysis_requests" ADD CONSTRAINT "analysis_requests_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "evidences"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "analysis_requests" ADD CONSTRAINT "analysis_requests_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "analysis_requests" ADD CONSTRAINT "analysis_requests_evidence_id_b_fkey" FOREIGN KEY ("evidence_id_b") REFERENCES "evidences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AnalysisResult
ALTER TABLE "analysis_results" ADD CONSTRAINT "analysis_results_analysis_request_id_fkey" FOREIGN KEY ("analysis_request_id") REFERENCES "analysis_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Tag
ALTER TABLE "tags" ADD CONSTRAINT "tags_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CaseTag
ALTER TABLE "case_tags" ADD CONSTRAINT "case_tags_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "case_tags" ADD CONSTRAINT "case_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- EvidenceTag
ALTER TABLE "evidence_tags" ADD CONSTRAINT "evidence_tags_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "evidences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evidence_tags" ADD CONSTRAINT "evidence_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Export
ALTER TABLE "exports" ADD CONSTRAINT "exports_analysis_result_id_fkey" FOREIGN KEY ("analysis_result_id") REFERENCES "analysis_results"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AuditLog
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AnalysisMessage
ALTER TABLE "analysis_messages" ADD CONSTRAINT "analysis_messages_analysis_request_id_fkey" FOREIGN KEY ("analysis_request_id") REFERENCES "analysis_requests"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- ProcessedDocument
ALTER TABLE "processed_documents" ADD CONSTRAINT "processed_documents_evidence_file_id_fkey" FOREIGN KEY ("evidence_file_id") REFERENCES "evidence_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ExtractedImage
ALTER TABLE "extracted_images" ADD CONSTRAINT "extracted_images_processed_document_id_fkey" FOREIGN KEY ("processed_document_id") REFERENCES "processed_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- WhatsappChat
ALTER TABLE "whatsapp_chats" ADD CONSTRAINT "whatsapp_chats_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "evidences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- WhatsappMessage
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_whatsapp_chat_id_fkey" FOREIGN KEY ("whatsapp_chat_id") REFERENCES "whatsapp_chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Transcription
ALTER TABLE "transcriptions" ADD CONSTRAINT "transcriptions_evidence_file_id_fkey" FOREIGN KEY ("evidence_file_id") REFERENCES "evidence_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- VideoFrame
ALTER TABLE "video_frames" ADD CONSTRAINT "video_frames_evidence_file_id_fkey" FOREIGN KEY ("evidence_file_id") REFERENCES "evidence_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- EmailVerification
ALTER TABLE "email_verifications" ADD CONSTRAINT "email_verifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AiConfigVariable
ALTER TABLE "ai_config_variables" ADD CONSTRAINT "fk_service_type" FOREIGN KEY ("service_type") REFERENCES "ai_service_configs"("service_type") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- TokenUsage
ALTER TABLE "token_usage" ADD CONSTRAINT "token_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "token_usage" ADD CONSTRAINT "token_usage_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "analysis_requests"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "token_usage" ADD CONSTRAINT "token_usage_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
