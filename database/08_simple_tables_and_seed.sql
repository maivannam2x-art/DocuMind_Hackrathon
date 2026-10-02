-- DOCUMIND: BANG VA DU LIEU BAN DAU (KHONG TAO FUNCTION / TRIGGER)
-- Chay mot lan tren project Supabase MOI, chua co bang DocuMind.
-- Khong chay sau file 01_fresh_production_bootstrap.sql.
-- Chi file nay KHONG du de chay day du code hien tai: xem 09_simple_runtime_addon.sql.
-- RLS va quyen duoc giu de bao ve du lieu. Khong chua tai khoan, mat khau hay API key.
BEGIN;

-- 1. Kieu du lieu
CREATE TYPE public."analysis_status" AS ENUM ('draft', 'validating', 'needs_review', 'ready', 'processing', 'completed', 'failed', 'expired');
CREATE TYPE public."chunk_status" AS ENUM ('pending', 'processing', 'complete', 'failed');
CREATE TYPE public."input_status" AS ENUM ('staged', 'extracted', 'needs_review', 'valid', 'error');
CREATE TYPE public."llm_exchange_status" AS ENUM ('started', 'succeeded', 'failed');
CREATE TYPE public."quiz_attempt_status" AS ENUM ('in_progress', 'submitted');

-- 2. Tao truc tiep 19 bang voi cau truc cuoi cung
CREATE TABLE public."analyses" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid,
  "guest_session_hash" text,
  "title" text DEFAULT 'Phân tích mới'::text NOT NULL,
  "topic_id" uuid,
  "specialization_id" uuid,
  "prompt_template_id" uuid,
  "custom_prompt" text,
  "quiz_enabled" boolean DEFAULT false NOT NULL,
  "status" analysis_status DEFAULT 'draft'::analysis_status NOT NULL,
  "validation_report" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "error_code" text,
  "error_message" text,
  "model_provider" text,
  "model_name" text,
  "confirmed_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "quiz_settings" jsonb DEFAULT '{"types": ["multiple_choice"], "difficulty": "mixed", "questionCount": 20}'::jsonb NOT NULL,
  "finalization_lease_until" timestamp with time zone,
  CONSTRAINT "analyses_created_at_not_null" NOT NULL created_at,
  CONSTRAINT "analyses_id_not_null" NOT NULL id,
  CONSTRAINT "analyses_pkey" PRIMARY KEY (id),
  CONSTRAINT "analyses_quiz_enabled_not_null" NOT NULL quiz_enabled,
  CONSTRAINT "analyses_quiz_settings_not_null" NOT NULL quiz_settings,
  CONSTRAINT "analyses_status_not_null" NOT NULL status,
  CONSTRAINT "analyses_title_not_null" NOT NULL title,
  CONSTRAINT "analyses_updated_at_not_null" NOT NULL updated_at,
  CONSTRAINT "analyses_validation_report_not_null" NOT NULL validation_report,
  CONSTRAINT "analysis_owner_check" CHECK (((((user_id IS NOT NULL))::integer + ((guest_session_hash IS NOT NULL))::integer) = 1))
);

CREATE TABLE public."analysis_activity" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "analysis_id" uuid NOT NULL,
  "actor" text NOT NULL,
  "label" text NOT NULL,
  "model" text,
  "status" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  CONSTRAINT "analysis_activity_actor_check" CHECK ((actor = ANY (ARRAY['ai'::text, 'system'::text]))),
  CONSTRAINT "analysis_activity_actor_not_null" NOT NULL actor,
  CONSTRAINT "analysis_activity_analysis_id_not_null" NOT NULL analysis_id,
  CONSTRAINT "analysis_activity_created_at_not_null" NOT NULL created_at,
  CONSTRAINT "analysis_activity_id_not_null" NOT NULL id,
  CONSTRAINT "analysis_activity_label_check" CHECK ((length(label) <= 300)),
  CONSTRAINT "analysis_activity_label_not_null" NOT NULL label,
  CONSTRAINT "analysis_activity_pkey" PRIMARY KEY (id),
  CONSTRAINT "analysis_activity_status_check" CHECK ((status = ANY (ARRAY['running'::text, 'succeeded'::text, 'failed'::text]))),
  CONSTRAINT "analysis_activity_status_not_null" NOT NULL status
);

CREATE TABLE public."analysis_chunks" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "analysis_id" uuid NOT NULL,
  "input_id" uuid NOT NULL,
  "chunk_index" integer NOT NULL,
  "title" text,
  "content" text NOT NULL,
  "char_start" integer DEFAULT 0 NOT NULL,
  "char_end" integer DEFAULT 0 NOT NULL,
  "status" chunk_status DEFAULT 'pending'::chunk_status NOT NULL,
  "retry_count" integer DEFAULT 0 NOT NULL,
  "error_message" text,
  "generated_content" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "quiz_finished" boolean DEFAULT false NOT NULL,
  "quiz_batches" integer DEFAULT 0 NOT NULL,
  "quiz_lease_until" timestamp with time zone,
  CONSTRAINT "analysis_chunks_analysis_id_not_null" NOT NULL analysis_id,
  CONSTRAINT "analysis_chunks_char_end_not_null" NOT NULL char_end,
  CONSTRAINT "analysis_chunks_char_start_not_null" NOT NULL char_start,
  CONSTRAINT "analysis_chunks_chunk_index_check" CHECK ((chunk_index >= 0)),
  CONSTRAINT "analysis_chunks_chunk_index_not_null" NOT NULL chunk_index,
  CONSTRAINT "analysis_chunks_content_not_null" NOT NULL content,
  CONSTRAINT "analysis_chunks_created_at_not_null" NOT NULL created_at,
  CONSTRAINT "analysis_chunks_id_not_null" NOT NULL id,
  CONSTRAINT "analysis_chunks_input_id_chunk_index_key" UNIQUE (input_id, chunk_index),
  CONSTRAINT "analysis_chunks_input_id_not_null" NOT NULL input_id,
  CONSTRAINT "analysis_chunks_pkey" PRIMARY KEY (id),
  CONSTRAINT "analysis_chunks_quiz_batches_not_null" NOT NULL quiz_batches,
  CONSTRAINT "analysis_chunks_quiz_finished_not_null" NOT NULL quiz_finished,
  CONSTRAINT "analysis_chunks_retry_count_check" CHECK ((retry_count >= 0)),
  CONSTRAINT "analysis_chunks_retry_count_not_null" NOT NULL retry_count,
  CONSTRAINT "analysis_chunks_status_not_null" NOT NULL status,
  CONSTRAINT "analysis_chunks_updated_at_not_null" NOT NULL updated_at
);

CREATE TABLE public."analysis_inputs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "analysis_id" uuid NOT NULL,
  "input_kind" text NOT NULL,
  "original_name" text,
  "mime_type" text,
  "byte_size" bigint DEFAULT 0 NOT NULL,
  "storage_bucket" text,
  "storage_path" text,
  "original_text" text,
  "normalized_text" text,
  "edited_text" text,
  "status" input_status DEFAULT 'staged'::input_status NOT NULL,
  "validation_report" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "ingest_lease_until" timestamp with time zone,
  CONSTRAINT "analysis_inputs_analysis_id_not_null" NOT NULL analysis_id,
  CONSTRAINT "analysis_inputs_byte_size_check" CHECK ((byte_size >= 0)),
  CONSTRAINT "analysis_inputs_byte_size_not_null" NOT NULL byte_size,
  CONSTRAINT "analysis_inputs_created_at_not_null" NOT NULL created_at,
  CONSTRAINT "analysis_inputs_id_not_null" NOT NULL id,
  CONSTRAINT "analysis_inputs_input_kind_check" CHECK ((input_kind = ANY (ARRAY['file'::text, 'pasted_text'::text]))),
  CONSTRAINT "analysis_inputs_input_kind_not_null" NOT NULL input_kind,
  CONSTRAINT "analysis_inputs_metadata_not_null" NOT NULL metadata,
  CONSTRAINT "analysis_inputs_pkey" PRIMARY KEY (id),
  CONSTRAINT "analysis_inputs_position_not_null" NOT NULL "position",
  CONSTRAINT "analysis_inputs_status_not_null" NOT NULL status,
  CONSTRAINT "analysis_inputs_updated_at_not_null" NOT NULL updated_at,
  CONSTRAINT "analysis_inputs_validation_report_not_null" NOT NULL validation_report,
  CONSTRAINT "input_payload_check" CHECK ((((input_kind = 'pasted_text'::text) AND (original_text IS NOT NULL)) OR ((input_kind = 'file'::text) AND ((storage_path IS NOT NULL) OR (original_name IS NOT NULL)))))
);

CREATE TABLE public."analysis_results" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "analysis_id" uuid NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "schema_version" text DEFAULT '1.0'::text NOT NULL,
  "result_json" jsonb NOT NULL,
  "summary" text,
  "source_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "is_current" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "analysis_results_analysis_id_not_null" NOT NULL analysis_id,
  CONSTRAINT "analysis_results_analysis_id_version_key" UNIQUE (analysis_id, version),
  CONSTRAINT "analysis_results_created_at_not_null" NOT NULL created_at,
  CONSTRAINT "analysis_results_id_not_null" NOT NULL id,
  CONSTRAINT "analysis_results_is_current_not_null" NOT NULL is_current,
  CONSTRAINT "analysis_results_pkey" PRIMARY KEY (id),
  CONSTRAINT "analysis_results_result_json_not_null" NOT NULL result_json,
  CONSTRAINT "analysis_results_schema_version_not_null" NOT NULL schema_version,
  CONSTRAINT "analysis_results_source_metadata_not_null" NOT NULL source_metadata,
  CONSTRAINT "analysis_results_version_check" CHECK ((version > 0)),
  CONSTRAINT "analysis_results_version_not_null" NOT NULL version,
  CONSTRAINT "result_shape_check" CHECK (((jsonb_typeof(result_json) = 'object'::text) AND (jsonb_typeof((result_json -> 'sections'::text)) = 'array'::text)))
);

CREATE TABLE public."api_rate_limits" (
  "key_hash" text NOT NULL,
  "window_started_at" timestamp with time zone NOT NULL,
  "hits" integer NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  CONSTRAINT "api_rate_limits_expires_at_not_null" NOT NULL expires_at,
  CONSTRAINT "api_rate_limits_hits_check" CHECK ((hits > 0)),
  CONSTRAINT "api_rate_limits_hits_not_null" NOT NULL hits,
  CONSTRAINT "api_rate_limits_key_hash_not_null" NOT NULL key_hash,
  CONSTRAINT "api_rate_limits_pkey" PRIMARY KEY (key_hash),
  CONSTRAINT "api_rate_limits_window_started_at_not_null" NOT NULL window_started_at
);

CREATE TABLE public."chat_messages" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "analysis_id" uuid NOT NULL,
  "role" text NOT NULL,
  "content" text NOT NULL,
  "citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "chat_messages_analysis_id_not_null" NOT NULL analysis_id,
  CONSTRAINT "chat_messages_citations_not_null" NOT NULL citations,
  CONSTRAINT "chat_messages_content_not_null" NOT NULL content,
  CONSTRAINT "chat_messages_created_at_not_null" NOT NULL created_at,
  CONSTRAINT "chat_messages_id_not_null" NOT NULL id,
  CONSTRAINT "chat_messages_metadata_not_null" NOT NULL metadata,
  CONSTRAINT "chat_messages_pkey" PRIMARY KEY (id),
  CONSTRAINT "chat_messages_role_check" CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text, 'system'::text]))),
  CONSTRAINT "chat_messages_role_not_null" NOT NULL role
);

CREATE TABLE public."exports" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "analysis_id" uuid NOT NULL,
  "result_id" uuid,
  "format" text NOT NULL,
  "status" text DEFAULT 'ready'::text NOT NULL,
  "storage_bucket" text,
  "storage_path" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "exports_analysis_id_not_null" NOT NULL analysis_id,
  CONSTRAINT "exports_created_at_not_null" NOT NULL created_at,
  CONSTRAINT "exports_format_check" CHECK ((format = ANY (ARRAY['json'::text, 'markdown'::text, 'html'::text, 'pdf'::text, 'docx'::text]))),
  CONSTRAINT "exports_format_not_null" NOT NULL format,
  CONSTRAINT "exports_id_not_null" NOT NULL id,
  CONSTRAINT "exports_pkey" PRIMARY KEY (id),
  CONSTRAINT "exports_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'ready'::text, 'failed'::text]))),
  CONSTRAINT "exports_status_not_null" NOT NULL status
);

CREATE TABLE public."gemini_model_health" (
  "scope" text NOT NULL,
  "model" text NOT NULL,
  "failures" integer DEFAULT 0 NOT NULL,
  "generation" bigint DEFAULT 0 NOT NULL,
  "open_until" timestamp with time zone,
  "probe_until" timestamp with time zone,
  "last_status" integer,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "gemini_model_health_failures_check" CHECK ((failures >= 0)),
  CONSTRAINT "gemini_model_health_failures_not_null" NOT NULL failures,
  CONSTRAINT "gemini_model_health_generation_not_null" NOT NULL generation,
  CONSTRAINT "gemini_model_health_model_check" CHECK (((length(model) >= 1) AND (length(model) <= 100))),
  CONSTRAINT "gemini_model_health_model_not_null" NOT NULL model,
  CONSTRAINT "gemini_model_health_pkey" PRIMARY KEY (scope, model),
  CONSTRAINT "gemini_model_health_scope_check" CHECK ((length(scope) = 64)),
  CONSTRAINT "gemini_model_health_scope_not_null" NOT NULL scope,
  CONSTRAINT "gemini_model_health_updated_at_not_null" NOT NULL updated_at
);

CREATE TABLE public."generated_assets" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "analysis_id" uuid NOT NULL,
  "result_id" uuid,
  "asset_type" text NOT NULL,
  "title" text,
  "source" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "storage_bucket" text,
  "storage_path" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "generated_assets_analysis_id_not_null" NOT NULL analysis_id,
  CONSTRAINT "generated_assets_asset_type_check" CHECK ((asset_type = ANY (ARRAY['latex'::text, 'mermaid'::text, 'plantuml'::text, 'code'::text, 'image'::text, 'other'::text]))),
  CONSTRAINT "generated_assets_asset_type_not_null" NOT NULL asset_type,
  CONSTRAINT "generated_assets_created_at_not_null" NOT NULL created_at,
  CONSTRAINT "generated_assets_id_not_null" NOT NULL id,
  CONSTRAINT "generated_assets_metadata_not_null" NOT NULL metadata,
  CONSTRAINT "generated_assets_pkey" PRIMARY KEY (id)
);

CREATE TABLE public."llm_exchanges" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "analysis_id" uuid NOT NULL,
  "chunk_id" uuid,
  "prompt_template_id" uuid,
  "purpose" text NOT NULL,
  "provider" text NOT NULL,
  "model" text NOT NULL,
  "attempt" integer DEFAULT 1 NOT NULL,
  "request_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "response_payload" jsonb,
  "input_tokens" integer,
  "output_tokens" integer,
  "latency_ms" integer,
  "status" llm_exchange_status DEFAULT 'started'::llm_exchange_status NOT NULL,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "llm_exchanges_analysis_id_not_null" NOT NULL analysis_id,
  CONSTRAINT "llm_exchanges_attempt_check" CHECK ((attempt > 0)),
  CONSTRAINT "llm_exchanges_attempt_not_null" NOT NULL attempt,
  CONSTRAINT "llm_exchanges_created_at_not_null" NOT NULL created_at,
  CONSTRAINT "llm_exchanges_id_not_null" NOT NULL id,
  CONSTRAINT "llm_exchanges_model_not_null" NOT NULL model,
  CONSTRAINT "llm_exchanges_pkey" PRIMARY KEY (id),
  CONSTRAINT "llm_exchanges_provider_not_null" NOT NULL provider,
  CONSTRAINT "llm_exchanges_purpose_not_null" NOT NULL purpose,
  CONSTRAINT "llm_exchanges_request_payload_not_null" NOT NULL request_payload,
  CONSTRAINT "llm_exchanges_status_not_null" NOT NULL status
);

CREATE TABLE public."profiles" (
  "id" uuid NOT NULL,
  "username" text,
  "display_name" text,
  "avatar_url" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "profiles_created_at_not_null" NOT NULL created_at,
  CONSTRAINT "profiles_id_not_null" NOT NULL id,
  CONSTRAINT "profiles_pkey" PRIMARY KEY (id),
  CONSTRAINT "profiles_updated_at_not_null" NOT NULL updated_at,
  CONSTRAINT "profiles_username_key" UNIQUE (username)
);

CREATE TABLE public."prompt_templates" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "purpose" text NOT NULL,
  "topic_id" uuid,
  "specialization_id" uuid,
  "version" integer DEFAULT 1 NOT NULL,
  "name" text NOT NULL,
  "system_prompt" text NOT NULL,
  "user_prompt_template" text NOT NULL,
  "output_schema" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "model_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "prompt_templates_created_at_not_null" NOT NULL created_at,
  CONSTRAINT "prompt_templates_id_not_null" NOT NULL id,
  CONSTRAINT "prompt_templates_is_active_not_null" NOT NULL is_active,
  CONSTRAINT "prompt_templates_model_config_not_null" NOT NULL model_config,
  CONSTRAINT "prompt_templates_name_not_null" NOT NULL name,
  CONSTRAINT "prompt_templates_output_schema_not_null" NOT NULL output_schema,
  CONSTRAINT "prompt_templates_pkey" PRIMARY KEY (id),
  CONSTRAINT "prompt_templates_purpose_check" CHECK ((purpose = ANY (ARRAY['section_generation'::text, 'quiz_generation'::text, 'chat'::text, 'repair'::text, 'topic_detection'::text]))),
  CONSTRAINT "prompt_templates_purpose_name_version_key" UNIQUE (purpose, name, version),
  CONSTRAINT "prompt_templates_purpose_not_null" NOT NULL purpose,
  CONSTRAINT "prompt_templates_system_prompt_not_null" NOT NULL system_prompt,
  CONSTRAINT "prompt_templates_updated_at_not_null" NOT NULL updated_at,
  CONSTRAINT "prompt_templates_user_prompt_template_not_null" NOT NULL user_prompt_template,
  CONSTRAINT "prompt_templates_version_check" CHECK ((version > 0)),
  CONSTRAINT "prompt_templates_version_not_null" NOT NULL version
);

CREATE TABLE public."quiz_attempts" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "quiz_id" uuid NOT NULL,
  "user_id" uuid,
  "guest_session_hash" text,
  "answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "score" numeric(5,2),
  "total_questions" integer DEFAULT 0 NOT NULL,
  "status" quiz_attempt_status DEFAULT 'in_progress'::quiz_attempt_status NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "submitted_at" timestamp with time zone,
  CONSTRAINT "quiz_attempt_owner_check" CHECK (((((user_id IS NOT NULL))::integer + ((guest_session_hash IS NOT NULL))::integer) = 1)),
  CONSTRAINT "quiz_attempts_answers_not_null" NOT NULL answers,
  CONSTRAINT "quiz_attempts_id_not_null" NOT NULL id,
  CONSTRAINT "quiz_attempts_pkey" PRIMARY KEY (id),
  CONSTRAINT "quiz_attempts_quiz_id_not_null" NOT NULL quiz_id,
  CONSTRAINT "quiz_attempts_started_at_not_null" NOT NULL started_at,
  CONSTRAINT "quiz_attempts_status_not_null" NOT NULL status,
  CONSTRAINT "quiz_attempts_total_questions_not_null" NOT NULL total_questions
);

CREATE TABLE public."quiz_questions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "quiz_id" uuid NOT NULL,
  "question_index" integer NOT NULL,
  "question_type" text DEFAULT 'multiple_choice'::text NOT NULL,
  "prompt" text NOT NULL,
  "options" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "answer" jsonb NOT NULL,
  "explanation" text,
  "difficulty" text,
  "source_chunk_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "quiz_questions_answer_not_null" NOT NULL answer,
  CONSTRAINT "quiz_questions_created_at_not_null" NOT NULL created_at,
  CONSTRAINT "quiz_questions_difficulty_check" CHECK ((difficulty = ANY (ARRAY['easy'::text, 'medium'::text, 'hard'::text]))),
  CONSTRAINT "quiz_questions_id_not_null" NOT NULL id,
  CONSTRAINT "quiz_questions_options_not_null" NOT NULL options,
  CONSTRAINT "quiz_questions_pkey" PRIMARY KEY (id),
  CONSTRAINT "quiz_questions_prompt_not_null" NOT NULL prompt,
  CONSTRAINT "quiz_questions_question_index_check" CHECK ((question_index >= 0)),
  CONSTRAINT "quiz_questions_question_index_not_null" NOT NULL question_index,
  CONSTRAINT "quiz_questions_question_type_check" CHECK ((question_type = ANY (ARRAY['multiple_choice'::text, 'true_false'::text, 'short_answer'::text]))),
  CONSTRAINT "quiz_questions_question_type_not_null" NOT NULL question_type,
  CONSTRAINT "quiz_questions_quiz_id_not_null" NOT NULL quiz_id,
  CONSTRAINT "quiz_questions_quiz_id_question_index_key" UNIQUE (quiz_id, question_index)
);

CREATE TABLE public."quizzes" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "analysis_id" uuid NOT NULL,
  "result_id" uuid,
  "title" text DEFAULT 'Ôn tập nhanh'::text NOT NULL,
  "settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'ready'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "quizzes_analysis_id_not_null" NOT NULL analysis_id,
  CONSTRAINT "quizzes_created_at_not_null" NOT NULL created_at,
  CONSTRAINT "quizzes_id_not_null" NOT NULL id,
  CONSTRAINT "quizzes_pkey" PRIMARY KEY (id),
  CONSTRAINT "quizzes_settings_not_null" NOT NULL settings,
  CONSTRAINT "quizzes_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'ready'::text, 'failed'::text]))),
  CONSTRAINT "quizzes_status_not_null" NOT NULL status,
  CONSTRAINT "quizzes_title_not_null" NOT NULL title,
  CONSTRAINT "quizzes_updated_at_not_null" NOT NULL updated_at
);

CREATE TABLE public."topic_specializations" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "topic_id" uuid NOT NULL,
  "parent_id" uuid,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "description" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "topic_specializations_created_at_not_null" NOT NULL created_at,
  CONSTRAINT "topic_specializations_id_not_null" NOT NULL id,
  CONSTRAINT "topic_specializations_is_active_not_null" NOT NULL is_active,
  CONSTRAINT "topic_specializations_name_not_null" NOT NULL name,
  CONSTRAINT "topic_specializations_pkey" PRIMARY KEY (id),
  CONSTRAINT "topic_specializations_slug_not_null" NOT NULL slug,
  CONSTRAINT "topic_specializations_sort_order_not_null" NOT NULL sort_order,
  CONSTRAINT "topic_specializations_topic_id_not_null" NOT NULL topic_id,
  CONSTRAINT "topic_specializations_topic_id_slug_key" UNIQUE (topic_id, slug),
  CONSTRAINT "topic_specializations_updated_at_not_null" NOT NULL updated_at
);

CREATE TABLE public."topics" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "topics_code_key" UNIQUE (code),
  CONSTRAINT "topics_code_not_null" NOT NULL code,
  CONSTRAINT "topics_created_at_not_null" NOT NULL created_at,
  CONSTRAINT "topics_id_not_null" NOT NULL id,
  CONSTRAINT "topics_is_active_not_null" NOT NULL is_active,
  CONSTRAINT "topics_name_not_null" NOT NULL name,
  CONSTRAINT "topics_pkey" PRIMARY KEY (id),
  CONSTRAINT "topics_sort_order_not_null" NOT NULL sort_order,
  CONSTRAINT "topics_updated_at_not_null" NOT NULL updated_at
);

CREATE TABLE public."validation_rules" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "code" text NOT NULL,
  "stage" text NOT NULL,
  "severity" text NOT NULL,
  "description" text NOT NULL,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "validation_rules_code_key" UNIQUE (code),
  CONSTRAINT "validation_rules_code_not_null" NOT NULL code,
  CONSTRAINT "validation_rules_config_not_null" NOT NULL config,
  CONSTRAINT "validation_rules_created_at_not_null" NOT NULL created_at,
  CONSTRAINT "validation_rules_description_not_null" NOT NULL description,
  CONSTRAINT "validation_rules_id_not_null" NOT NULL id,
  CONSTRAINT "validation_rules_is_active_not_null" NOT NULL is_active,
  CONSTRAINT "validation_rules_pkey" PRIMARY KEY (id),
  CONSTRAINT "validation_rules_severity_check" CHECK ((severity = ANY (ARRAY['info'::text, 'warning'::text, 'error'::text]))),
  CONSTRAINT "validation_rules_severity_not_null" NOT NULL severity,
  CONSTRAINT "validation_rules_sort_order_not_null" NOT NULL sort_order,
  CONSTRAINT "validation_rules_stage_check" CHECK ((stage = ANY (ARRAY['input'::text, 'structure'::text, 'output'::text, 'quiz'::text]))),
  CONSTRAINT "validation_rules_stage_not_null" NOT NULL stage,
  CONSTRAINT "validation_rules_updated_at_not_null" NOT NULL updated_at
);

-- 3. Lien ket bang va chi muc
ALTER TABLE analyses ADD CONSTRAINT "analyses_prompt_template_id_fkey" FOREIGN KEY (prompt_template_id) REFERENCES prompt_templates(id) ON DELETE SET NULL;
ALTER TABLE analyses ADD CONSTRAINT "analyses_specialization_id_fkey" FOREIGN KEY (specialization_id) REFERENCES topic_specializations(id) ON DELETE SET NULL;
ALTER TABLE analyses ADD CONSTRAINT "analyses_topic_id_fkey" FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE SET NULL;
ALTER TABLE analyses ADD CONSTRAINT "analyses_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE analysis_activity ADD CONSTRAINT "analysis_activity_analysis_id_fkey" FOREIGN KEY (analysis_id) REFERENCES analyses(id) ON DELETE CASCADE;
ALTER TABLE analysis_chunks ADD CONSTRAINT "analysis_chunks_analysis_id_fkey" FOREIGN KEY (analysis_id) REFERENCES analyses(id) ON DELETE CASCADE;
ALTER TABLE analysis_chunks ADD CONSTRAINT "analysis_chunks_input_id_fkey" FOREIGN KEY (input_id) REFERENCES analysis_inputs(id) ON DELETE CASCADE;
ALTER TABLE analysis_inputs ADD CONSTRAINT "analysis_inputs_analysis_id_fkey" FOREIGN KEY (analysis_id) REFERENCES analyses(id) ON DELETE CASCADE;
ALTER TABLE analysis_results ADD CONSTRAINT "analysis_results_analysis_id_fkey" FOREIGN KEY (analysis_id) REFERENCES analyses(id) ON DELETE CASCADE;
ALTER TABLE chat_messages ADD CONSTRAINT "chat_messages_analysis_id_fkey" FOREIGN KEY (analysis_id) REFERENCES analyses(id) ON DELETE CASCADE;
ALTER TABLE exports ADD CONSTRAINT "exports_analysis_id_fkey" FOREIGN KEY (analysis_id) REFERENCES analyses(id) ON DELETE CASCADE;
ALTER TABLE exports ADD CONSTRAINT "exports_result_id_fkey" FOREIGN KEY (result_id) REFERENCES analysis_results(id) ON DELETE SET NULL;
ALTER TABLE generated_assets ADD CONSTRAINT "generated_assets_analysis_id_fkey" FOREIGN KEY (analysis_id) REFERENCES analyses(id) ON DELETE CASCADE;
ALTER TABLE generated_assets ADD CONSTRAINT "generated_assets_result_id_fkey" FOREIGN KEY (result_id) REFERENCES analysis_results(id) ON DELETE CASCADE;
ALTER TABLE llm_exchanges ADD CONSTRAINT "llm_exchanges_analysis_id_fkey" FOREIGN KEY (analysis_id) REFERENCES analyses(id) ON DELETE CASCADE;
ALTER TABLE llm_exchanges ADD CONSTRAINT "llm_exchanges_chunk_id_fkey" FOREIGN KEY (chunk_id) REFERENCES analysis_chunks(id) ON DELETE SET NULL;
ALTER TABLE llm_exchanges ADD CONSTRAINT "llm_exchanges_prompt_template_id_fkey" FOREIGN KEY (prompt_template_id) REFERENCES prompt_templates(id) ON DELETE SET NULL;
ALTER TABLE profiles ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE prompt_templates ADD CONSTRAINT "prompt_templates_specialization_id_fkey" FOREIGN KEY (specialization_id) REFERENCES topic_specializations(id) ON DELETE SET NULL;
ALTER TABLE prompt_templates ADD CONSTRAINT "prompt_templates_topic_id_fkey" FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE SET NULL;
ALTER TABLE quiz_attempts ADD CONSTRAINT "quiz_attempts_quiz_id_fkey" FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE;
ALTER TABLE quiz_attempts ADD CONSTRAINT "quiz_attempts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE quiz_questions ADD CONSTRAINT "quiz_questions_quiz_id_fkey" FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE;
ALTER TABLE quiz_questions ADD CONSTRAINT "quiz_questions_source_chunk_id_fkey" FOREIGN KEY (source_chunk_id) REFERENCES analysis_chunks(id) ON DELETE SET NULL;
ALTER TABLE quizzes ADD CONSTRAINT "quizzes_analysis_id_fkey" FOREIGN KEY (analysis_id) REFERENCES analyses(id) ON DELETE CASCADE;
ALTER TABLE quizzes ADD CONSTRAINT "quizzes_result_id_fkey" FOREIGN KEY (result_id) REFERENCES analysis_results(id) ON DELETE SET NULL;
ALTER TABLE topic_specializations ADD CONSTRAINT "topic_specializations_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES topic_specializations(id) ON DELETE SET NULL;
ALTER TABLE topic_specializations ADD CONSTRAINT "topic_specializations_topic_id_fkey" FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE;
CREATE INDEX analyses_guest_created_idx ON public.analyses USING btree (guest_session_hash, created_at DESC) WHERE (guest_session_hash IS NOT NULL);
CREATE INDEX analyses_prompt_template_fk_idx ON public.analyses USING btree (prompt_template_id);
CREATE INDEX analyses_specialization_fk_idx ON public.analyses USING btree (specialization_id);
CREATE INDEX analyses_status_idx ON public.analyses USING btree (status, updated_at);
CREATE INDEX analyses_topic_fk_idx ON public.analyses USING btree (topic_id);
CREATE INDEX analyses_user_created_idx ON public.analyses USING btree (user_id, created_at DESC) WHERE (user_id IS NOT NULL);
CREATE INDEX analysis_activity_analysis_created_idx ON public.analysis_activity USING btree (analysis_id, created_at DESC);
CREATE INDEX analysis_chunks_analysis_idx ON public.analysis_chunks USING btree (analysis_id, chunk_index);
CREATE INDEX analysis_inputs_analysis_idx ON public.analysis_inputs USING btree (analysis_id, "position");
CREATE UNIQUE INDEX analysis_results_one_current_idx ON public.analysis_results USING btree (analysis_id) WHERE is_current;
CREATE INDEX api_rate_limits_expiry_idx ON public.api_rate_limits USING btree (expires_at);
CREATE INDEX chat_messages_analysis_idx ON public.chat_messages USING btree (analysis_id, created_at);
CREATE INDEX exports_analysis_idx ON public.exports USING btree (analysis_id, created_at DESC);
CREATE INDEX exports_result_fk_idx ON public.exports USING btree (result_id);
CREATE INDEX generated_assets_analysis_idx ON public.generated_assets USING btree (analysis_id, asset_type);
CREATE INDEX generated_assets_result_fk_idx ON public.generated_assets USING btree (result_id);
CREATE INDEX llm_exchanges_analysis_idx ON public.llm_exchanges USING btree (analysis_id, created_at);
CREATE INDEX llm_exchanges_chunk_fk_idx ON public.llm_exchanges USING btree (chunk_id);
CREATE INDEX llm_exchanges_prompt_fk_idx ON public.llm_exchanges USING btree (prompt_template_id);
CREATE INDEX prompt_templates_lookup_idx ON public.prompt_templates USING btree (purpose, topic_id, specialization_id, is_active);
CREATE INDEX prompt_templates_specialization_fk_idx ON public.prompt_templates USING btree (specialization_id);
CREATE INDEX prompt_templates_topic_fk_idx ON public.prompt_templates USING btree (topic_id);
CREATE INDEX quiz_attempts_quiz_idx ON public.quiz_attempts USING btree (quiz_id, started_at DESC);
CREATE INDEX quiz_attempts_user_fk_idx ON public.quiz_attempts USING btree (user_id);
CREATE INDEX quiz_questions_quiz_idx ON public.quiz_questions USING btree (quiz_id, question_index);
CREATE INDEX quiz_questions_source_chunk_fk_idx ON public.quiz_questions USING btree (source_chunk_id);
CREATE INDEX quizzes_analysis_idx ON public.quizzes USING btree (analysis_id, created_at DESC);
CREATE INDEX quizzes_result_fk_idx ON public.quizzes USING btree (result_id);
CREATE INDEX topic_specializations_parent_fk_idx ON public.topic_specializations USING btree (parent_id);
CREATE INDEX topic_specializations_parent_idx ON public.topic_specializations USING btree (topic_id, parent_id, sort_order);

-- 4. Du lieu IT dang hoat dong; khong sao chep du lieu nguoi dung

-- topics: 1 ban ghi
INSERT INTO public."topics" ("id", "code", "name", "description", "is_active", "sort_order", "created_at", "updated_at") VALUES
('f0fd39a7-8db1-4a64-ac42-f448ead7d059', 'IT', 'Công nghệ thông tin', 'Tài liệu kỹ thuật về phần mềm, lập trình, dữ liệu, mạng, an ninh và hạ tầng.', 'true', '1', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02');

-- topic_specializations: 73 ban ghi
INSERT INTO public."topic_specializations" ("id", "topic_id", "parent_id", "name", "slug", "description", "is_active", "sort_order", "created_at", "updated_at") VALUES
('00a62f33-761d-4e3b-8b21-0630062a3924', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', NULL, 'Cơ sở dữ liệu', 'databases', 'Mô hình dữ liệu, SQL, NoSQL, chỉ mục và giao dịch.', 'true', '60', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('01da4a04-28e1-4713-9314-52a6bc18869f', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '60a773ff-03c0-41aa-beb5-d1d4a28bfa0c', 'Kafka và RabbitMQ', 'distributed-messaging', 'Topic, queue, partition, delivery và consumer.', 'true', '30', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('03db3aef-2b8a-40bc-8a8f-439f9c299cdb', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', NULL, 'Phát triển ứng dụng di động', 'mobile-development', 'Android, iOS và kiến trúc ứng dụng di động.', 'true', '40', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('0886ab6c-ea2b-4f9f-a5eb-0d7a695af11e', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', NULL, 'Cấu trúc dữ liệu và giải thuật', 'data-structures-algorithms', 'Cấu trúc dữ liệu, độ phức tạp và chiến lược giải thuật.', 'true', '50', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('10c7e6cd-389d-4f93-ba66-bc965b87379f', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '3efd7a7d-af08-4624-b33a-e13d3100879a', 'PHP và Laravel', 'programming-php-laravel', 'PHP, Laravel, Eloquent, middleware, queue và thiết kế ứng dụng.', 'true', '60', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('18c0796c-7704-4361-bf52-f177c5b056df', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', 'c963c7a5-a573-4e0f-adaf-1aec11a83396', 'Machine learning', 'ai-machine-learning', 'Features, training, validation and evaluation.', 'true', '10', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('2377b8f1-4bc5-4ad7-a473-e7e919008bcb', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '63761378-33c5-4f85-89bf-b68cdf9e0a08', 'Agile, Scrum và quản lý yêu cầu', 'engineering-agile', 'Backlog, user story, sprint, acceptance criteria và traceability.', 'true', '30', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('26ccc2cd-33e3-4345-9925-eec0950d99e5', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '3b5168c5-d395-4391-92ea-a33760416ed5', 'Định danh và phân quyền', 'security-identity-access', 'Authentication, authorization and identity systems.', 'true', '30', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('283398db-2c0c-4d95-9d0f-da3875410143', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '62ad387d-760f-4719-99fb-3ff485e0a714', 'TCP/IP và định tuyến', 'network-tcp-ip', 'Addressing, routing, transport and network layers.', 'true', '10', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('2a82035a-31d4-43b7-a3d0-2f36062f5312', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '3efd7a7d-af08-4624-b33a-e13d3100879a', 'JavaScript và TypeScript', 'programming-javascript-typescript', 'JavaScript, TypeScript, browser and Node.js.', 'true', '20', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('2e5bcda1-d732-4d3e-ac3f-a0a7b11eba49', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', 'c963c7a5-a573-4e0f-adaf-1aec11a83396', 'Mô hình ngôn ngữ lớn', 'ai-llm', 'Prompting, retrieval, agents and LLM evaluation.', 'true', '30', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('2faa733e-67cd-4b23-ae99-e1fcae295842', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '63761378-33c5-4f85-89bf-b68cdf9e0a08', 'Kiến trúc và thiết kế phần mềm', 'engineering-architecture', 'Thiết kế module, SOLID, design pattern và đánh đổi kiến trúc.', 'true', '10', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('37374e87-9eaa-4aaa-a861-1b31bd0ad472', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '3b5168c5-d395-4391-92ea-a33760416ed5', 'Mật mã học ứng dụng', 'security-cryptography', 'Encryption, hashing, signatures and key management.', 'true', '20', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('38e23e29-0514-4ead-84bc-7c83395fad2c', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', NULL, 'Hệ điều hành', 'operating-systems', 'Tiến trình, luồng, bộ nhớ, đồng bộ và hệ thống tệp.', 'true', '120', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('3b5168c5-d395-4391-92ea-a33760416ed5', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', NULL, 'An ninh mạng', 'cybersecurity', 'Secure coding, bảo mật ứng dụng, mật mã và kiểm soát truy cập.', 'true', '80', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('3c0b6813-3b95-4e7e-852f-ddfc686bdf82', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '3efd7a7d-af08-4624-b33a-e13d3100879a', 'C và C++', 'programming-c-cpp', 'Memory, pointers, compilation and C/C++.', 'true', '40', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('3ccbc835-4324-47fc-b639-43e5c677d353', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '38e23e29-0514-4ead-84bc-7c83395fad2c', 'Tiến trình và đồng bộ', 'os-process-concurrency', 'Process, thread, scheduler, lock, deadlock và đồng bộ.', 'true', '10', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('3d57b007-c150-4bcd-b883-99dc557f5a41', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', NULL, 'Kiến trúc máy tính', 'computer-architecture', 'Logic số, CPU, bộ nhớ, tập lệnh và kiến trúc máy.', 'true', '130', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('3e98e8a0-5a78-4085-b974-9d515bc7727f', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', NULL, 'Kiểm thử phần mềm', 'software-testing', 'Unit, integration, end-to-end, hiệu năng và QA.', 'true', '140', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('3efd7a7d-af08-4624-b33a-e13d3100879a', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', NULL, 'Ngôn ngữ lập trình', 'programming-languages', 'Python, JavaScript/TypeScript, Java, C/C++, Go và Rust.', 'true', '10', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('46a81701-063e-46a6-a2e4-1b820baf2753', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', 'c963c7a5-a573-4e0f-adaf-1aec11a83396', 'Xử lý ngôn ngữ tự nhiên', 'ai-nlp', 'Tokenization, embedding, transformer và bài toán NLP.', 'true', '70', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('4d66500a-42c3-4231-bb13-4d8e6ef60271', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '00a62f33-761d-4e3b-8b21-0630062a3924', 'SQL Server', 'database-sqlserver', 'T-SQL, index, transaction, stored procedure và SQL Server.', 'true', '60', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('57232cdb-312d-484d-8bf2-9699b980430e', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '90d74f7f-8095-4bab-9ba0-ccc2ce2cae43', 'Pipeline và kho dữ liệu', 'data-pipelines-warehouse', 'ETL/ELT, data quality, batch/stream và kho dữ liệu.', 'true', '10', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('58f901c8-0e89-4544-beac-53db1c7a7f3c', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '3e98e8a0-5a78-4085-b974-9d515bc7727f', 'Kiểm thử hiệu năng', 'testing-performance', 'Load, stress, latency and capacity testing.', 'true', '20', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('5b9fafff-691d-412d-b27f-7e5fb2dd1829', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', 'cbd18243-2c4d-4446-a5db-1d50728b150e', 'Toán rời rạc và logic', 'fundamentals-discrete-math', 'Tập hợp, quan hệ, logic, tổ hợp và chứng minh trong IT.', 'true', '30', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('5bf06d5a-894e-4a32-8677-cc0265da12cc', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '3b5168c5-d395-4391-92ea-a33760416ed5', 'Bảo mật ứng dụng', 'security-application', 'Threat modeling, OWASP and secure software design.', 'true', '10', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('5c167a4f-e538-47e5-9a48-325e8e6db8c9', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '00a62f33-761d-4e3b-8b21-0630062a3924', 'Redis và cache', 'database-redis', 'Cache, expiration, eviction, data structure và nhất quán cache.', 'true', '80', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('5f85ddc5-8278-4bd8-a7c0-7da9e64a5428', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '3efd7a7d-af08-4624-b33a-e13d3100879a', 'Kotlin và Swift', 'programming-kotlin-swift', 'Kotlin, coroutine, Swift, optional và lập trình ứng dụng.', 'true', '70', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('60a773ff-03c0-41aa-beb5-d1d4a28bfa0c', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', NULL, 'Hệ thống phân tán', 'distributed-systems', 'Đồng thuận, nhất quán, chịu lỗi và khả năng mở rộng.', 'true', '150', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('60f0db2a-e48f-4c7e-8f28-2f20eb951304', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '63761378-33c5-4f85-89bf-b68cdf9e0a08', 'Phát triển game', 'engineering-game-development', 'Game loop, engine, rendering, physics và kiến trúc game.', 'true', '50', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('610bd8c8-6408-49f1-802a-06fec6183654', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', 'cbd18243-2c4d-4446-a5db-1d50728b150e', 'Xác suất và thống kê cho IT', 'fundamentals-statistics', 'Phân phối, ước lượng, kiểm định và dữ liệu trong IT.', 'true', '40', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('62ad387d-760f-4719-99fb-3ff485e0a714', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', NULL, 'Mạng máy tính', 'computer-networks', 'TCP/IP, định tuyến, HTTP, DNS và giao thức mạng.', 'true', '70', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('6375cee5-ee7b-411d-9da1-fb7afc4f3752', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '00a62f33-761d-4e3b-8b21-0630062a3924', 'MySQL và MariaDB', 'database-mysql', 'SQL, InnoDB, transaction và tối ưu truy vấn.', 'true', '70', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('63761378-33c5-4f85-89bf-b68cdf9e0a08', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', NULL, 'Kỹ nghệ phần mềm', 'software-engineering', 'Yêu cầu, thiết kế, kiến trúc, mẫu thiết kế và SOLID.', 'true', '20', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('64aa4432-4cf1-4c81-8025-d4a4526f60c4', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', 'f00968eb-e3e8-40d9-95ec-94de4a3780dc', 'AWS, Azure và Google Cloud', 'devops-cloud-platforms', 'Dịch vụ cloud, IAM, network, compute, storage và triển khai.', 'true', '40', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('6db15971-356a-4706-8218-0fa12d183a42', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', 'f00968eb-e3e8-40d9-95ec-94de4a3780dc', 'Container và Kubernetes', 'devops-containers-kubernetes', 'Images, containers, orchestration and deployment.', 'true', '10', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('7219fd51-d65f-4c23-949e-e9c230d42e1b', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '60a773ff-03c0-41aa-beb5-d1d4a28bfa0c', 'Nhất quán và chịu lỗi', 'distributed-consistency', 'Replication, consistency, retry, idempotency và khả năng chịu lỗi.', 'true', '10', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('7898bb50-8aea-4711-94cc-9f01e7c348f6', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', 'f89d10e0-f780-4b44-9d46-39b91ef4ee22', 'GraphQL và gRPC', 'web-graphql-grpc', 'Schema, resolver, protobuf, streaming và thiết kế API.', 'true', '50', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('7b5e5518-7962-436a-82e7-d019842b4863', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '3d57b007-c150-4bcd-b883-99dc557f5a41', 'CPU và bộ nhớ', 'architecture-cpu-memory', 'Tập lệnh, pipeline, cache, bộ nhớ và hiệu năng.', 'true', '10', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('7ec8a679-d19e-482e-923a-e1ae69e0aac8', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '3efd7a7d-af08-4624-b33a-e13d3100879a', 'Python', 'programming-python', 'Python syntax, data types, runtime and common libraries.', 'true', '10', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('8152c2bc-0dfc-4c0f-8955-d546ecf3905e', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '0886ab6c-ea2b-4f9f-a5eb-0d7a695af11e', 'Thuật toán và độ phức tạp', 'dsa-algorithms-complexity', 'Độ phức tạp, truy vết, chứng minh đúng và các kỹ thuật giải thuật.', 'true', '20', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('87ac89eb-3073-4a9f-9620-9c3fcb4cf722', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '62ad387d-760f-4719-99fb-3ff485e0a714', 'HTTP, DNS và web protocol', 'network-http-dns', 'HTTP, DNS, TLS and browser-server communication.', 'true', '20', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('885436a0-513e-4b01-bf79-326e86181d86', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '00a62f33-761d-4e3b-8b21-0630062a3924', 'NoSQL', 'database-nosql', 'Document, key-value, graph and wide-column data stores.', 'true', '20', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('8a30278f-7ff7-48af-9ddb-39ebd9d1265d', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', 'f00968eb-e3e8-40d9-95ec-94de4a3780dc', 'Infrastructure as Code', 'devops-iac', 'Terraform, cấu hình hạ tầng, state và provisioning.', 'true', '50', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('8bbb3365-f9f8-46fd-a2db-b53549bc35d4', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '00a62f33-761d-4e3b-8b21-0630062a3924', 'PostgreSQL', 'database-postgresql', 'Kiểu dữ liệu, SQL, index, EXPLAIN, MVCC và RLS.', 'true', '50', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('90d74f7f-8095-4bab-9ba0-ccc2ce2cae43', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', NULL, 'Kỹ thuật dữ liệu', 'data-engineering', 'ETL/ELT, pipeline, kho dữ liệu và xử lý dữ liệu lớn.', 'true', '100', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('922d8e18-d297-4286-af6a-9d59ac73634d', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '3efd7a7d-af08-4624-b33a-e13d3100879a', 'C# và .NET', 'programming-csharp-dotnet', 'C#, CLR, LINQ, ASP.NET Core, async/await và quản lý bộ nhớ.', 'true', '50', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('9f7d4a18-1b0a-4c2f-a312-e1579b8c66a4', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '60a773ff-03c0-41aa-beb5-d1d4a28bfa0c', 'Microservices và event-driven', 'distributed-microservices', 'Phân rã dịch vụ, messaging, saga, outbox và idempotency.', 'true', '20', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('a5bd1ea3-cc45-4097-ac64-4dbf8b69bb6f', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '3e98e8a0-5a78-4085-b974-9d515bc7727f', 'Unit và integration test', 'testing-unit-integration', 'Test design, doubles, boundaries and integration coverage.', 'true', '10', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('b0694612-2a9e-4674-8afd-673392cdaac8', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '63761378-33c5-4f85-89bf-b68cdf9e0a08', 'Thiết kế trải nghiệm người dùng', 'engineering-hci-ux', 'HCI, usability, accessibility, flow và đánh giá UX.', 'true', '40', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('b0fdd460-090a-43d3-8ed7-4dd64f49a684', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '3d57b007-c150-4bcd-b883-99dc557f5a41', 'Hệ thống nhúng và IoT', 'architecture-embedded-iot', 'Vi điều khiển, firmware, RTOS, cảm biến, giao thức và IoT.', 'true', '30', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('b19eb633-077a-469f-9637-39d2373b1dac', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', 'f89d10e0-f780-4b44-9d46-39b91ef4ee22', 'Spring Boot và Spring Security', 'web-spring-security', 'Spring Boot, DI, JPA, transaction, JWT, OAuth và phân quyền.', 'true', '30', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('b94aed6d-95af-4b76-8353-84bf1b7252e3', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '03db3aef-2b8a-40bc-8a8f-439f9c299cdb', 'Android và iOS', 'mobile-android-ios', 'Vòng đời, giao diện, lưu trữ và kiến trúc ứng dụng di động.', 'true', '10', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('c292d63a-17a1-411f-ae5f-f9a5c6d4127a', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', 'f00968eb-e3e8-40d9-95ec-94de4a3780dc', 'Quan sát và vận hành', 'devops-observability', 'Logs, metrics, traces, cảnh báo và xử lý sự cố.', 'true', '30', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('c3b024ee-6fe5-4f37-b954-1c007f24afe4', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', 'f89d10e0-f780-4b44-9d46-39b91ef4ee22', 'Frontend', 'web-frontend', 'HTML, CSS, JavaScript and UI application architecture.', 'true', '10', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('c4c2e0b8-1d8f-4535-901e-34b0a504517e', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', 'f00968eb-e3e8-40d9-95ec-94de4a3780dc', 'CI/CD và tự động hóa', 'devops-ci-cd', 'Build, test, release and deployment automation.', 'true', '20', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('c83e1663-3a1d-4951-9c8a-37e2c14f5279', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '00a62f33-761d-4e3b-8b21-0630062a3924', 'Mô hình dữ liệu và chỉ mục', 'database-modeling-indexing', 'Normalization, schema design, indexes and query plans.', 'true', '30', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('c963c7a5-a573-4e0f-adaf-1aec11a83396', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', NULL, 'Trí tuệ nhân tạo và học máy', 'artificial-intelligence', 'Machine learning, deep learning, LLM và đánh giá mô hình.', 'true', '90', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('c9cc241d-25ee-4978-acd1-0874a5c1120e', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '0886ab6c-ea2b-4f9f-a5eb-0d7a695af11e', 'Cấu trúc dữ liệu', 'dsa-data-structures', 'Mảng, danh sách liên kết, cây, heap, hash map và đồ thị.', 'true', '10', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('ca2a188e-57fa-4d48-9bc4-3a58beca96c0', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '3e98e8a0-5a78-4085-b974-9d515bc7727f', 'Kiểm thử bảo mật', 'testing-security', 'Threat modeling, SAST/DAST, kiểm tra phân quyền và dữ liệu.', 'true', '30', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('ca73992b-65a0-47d8-9e21-a1e9e0913984', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '3efd7a7d-af08-4624-b33a-e13d3100879a', 'Java', 'programming-java', 'Java language, JVM and ecosystem.', 'true', '30', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('cb63d63f-7129-4b36-8edf-a7f448b97bc4', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', 'c963c7a5-a573-4e0f-adaf-1aec11a83396', 'MLOps và triển khai mô hình', 'ai-mlops', 'Dataset, experiment, versioning, serving và model monitoring.', 'true', '60', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('cbd18243-2c4d-4446-a5db-1d50728b150e', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', NULL, 'Nền tảng công nghệ thông tin', 'it-fundamentals', 'Thuật ngữ và kiến thức nền tảng của ngành công nghệ thông tin.', 'true', '160', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('ccb23466-24dc-4c21-9c3d-e26ae335abcc', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', 'c963c7a5-a573-4e0f-adaf-1aec11a83396', 'Deep learning', 'ai-deep-learning', 'Neural networks, optimization and deep learning models.', 'true', '20', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('d33fd1c9-6d22-46c9-a699-afd89e21a5f3', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '00a62f33-761d-4e3b-8b21-0630062a3924', 'Giao dịch và đồng thời', 'database-transactions', 'ACID, isolation levels, locks and concurrency.', 'true', '40', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('d511135a-c0cf-4ac7-b4f4-a94f24f4fc6e', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '00a62f33-761d-4e3b-8b21-0630062a3924', 'SQL và cơ sở dữ liệu quan hệ', 'database-relational-sql', 'SQL, relational modeling, joins and constraints.', 'true', '10', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('e80d1d69-fa36-42fa-8159-4e6a59aa8cbd', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', 'f89d10e0-f780-4b44-9d46-39b91ef4ee22', 'React, Next.js và TypeScript', 'web-react-nextjs', 'React hooks, SSR, routing, cache, accessibility và TypeScript.', 'true', '40', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('ea0cc21f-f996-4441-b06b-bd553064964c', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', 'c963c7a5-a573-4e0f-adaf-1aec11a83396', 'Computer vision', 'ai-computer-vision', 'Ảnh, đặc trưng, CNN, detection, segmentation và đánh giá.', 'true', '50', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('efdbceb6-0639-465b-8d38-863393bea828', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '3efd7a7d-af08-4624-b33a-e13d3100879a', 'Go và Rust', 'programming-go-rust', 'Go concurrency and Rust ownership and safety.', 'true', '50', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('f00968eb-e3e8-40d9-95ec-94de4a3780dc', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', NULL, 'Cloud và DevOps', 'cloud-devops', 'Cloud, container, CI/CD, Kubernetes và quan sát hệ thống.', 'true', '110', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('f111a6bc-0155-46df-a000-236d02e975a7', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', 'f89d10e0-f780-4b44-9d46-39b91ef4ee22', 'Backend và API', 'web-backend-api', 'Server architecture, REST/GraphQL and API security.', 'true', '20', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('f89d10e0-f780-4b44-9d46-39b91ef4ee22', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', NULL, 'Phát triển web', 'web-development', 'Frontend, backend, HTTP, API và ứng dụng web.', 'true', '30', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('fde5d786-85cf-466b-afd1-b65494a75eb5', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', 'c963c7a5-a573-4e0f-adaf-1aec11a83396', 'RAG và đánh giá LLM', 'ai-rag-evaluation', 'Truy hồi tài liệu, trích dẫn, đánh giá chất lượng và an toàn đầu ra.', 'true', '40', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02');

-- prompt_templates: 43 ban ghi
INSERT INTO public."prompt_templates" ("id", "purpose", "topic_id", "specialization_id", "version", "name", "system_prompt", "user_prompt_template", "output_schema", "model_config", "is_active", "created_at", "updated_at") VALUES
('029a7ec0-4091-4730-a280-10a58e3d6f3a', 'section_generation', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '5c167a4f-e538-47e5-9a48-325e8e6db8c9', '1', 'DocuMind IT - database-redis', 'Bạn là trợ lý chuyên phân tích tài liệu Công nghệ thông tin. Bám sát tài liệu nguồn, giữ chính xác tên API, thuật ngữ, cú pháp, phiên bản, lệnh shell, đoạn code, SQL, cấu hình và số liệu. Không tự bịa hành vi của framework hoặc thư viện. Nếu tài liệu không nêu phiên bản hay điều kiện áp dụng, nói rõ. Trả JSON hợp lệ bằng tiếng Việt. Tạo sections có title, summary tùy chọn, blocks linh hoạt với type phù hợp: concept, explanation, code, command, sql, list, table, workflow, warning, formula hoặc diagram. Mỗi block có content.
Kết quả phải là một object JSON có sections[]. Mỗi block bắt buộc có type và content. Nếu content là object/array có cấu trúc thì bắt buộc thêm contentType: json, table, mermaid, plantuml, latex hoặc code phù hợp; không trả object dữ liệu không có nhãn. Dùng contentType=mermaid và mã Mermaid hợp lệ khi cần sơ đồ; dùng contentType=latex cho công thức. Danh sách dùng type=list hoặc key_points và content là mảng chuỗi. Không đặt JSON thô trong block paragraph/code.
Chuyên ngành: Redis và cache. Phạm vi: Cache, expiration, eviction, data structure và nhất quán cache.
Chỉ giải thích kiến thức có trong nguồn; giữ bảng hàng/cột, đơn vị và số liệu. Ví dụ bổ sung phải gắn metadata.isSupplementary=true. Không suy diễn quan hệ hoặc giá trị chưa có.', 'Phân tích phần tài liệu IT này để người học hiểu và áp dụng được. Chủ đề IT: {{topic}}. Yêu cầu bổ sung: {{custom_prompt}}. Làm rõ khái niệm, thuật ngữ, luồng xử lý, giả định, ưu/nhược điểm và liên hệ giữa các phần. Với code/lệnh/SQL, giải thích từng thành phần và không sửa nội dung nguồn nếu chưa nêu rõ. Nội dung nguồn: {{content}}
Định dạng block: {"type":"paragraph|list|table|code|formula|diagram|json", "content":"...", "contentType":"text|table|code|latex|mermaid|plantuml|json"}. Content object/array phải có contentType rõ ràng. Chỉ gắn sơ đồ khi có thể tạo cú pháp Mermaid hợp lệ; giữ công thức trong contentType=latex.', '{"type": "object", "required": ["sections"], "properties": {"title": {"type": "string"}, "summary": {"type": "string"}, "sections": {"type": "array", "items": {"type": "object", "required": ["title", "blocks"], "properties": {"title": {"type": "string"}, "blocks": {"type": "array", "items": {"type": "object", "required": ["type", "content"], "properties": {"type": {"type": "string"}, "content": {}, "metadata": {"type": "object"}, "contentType": {"enum": ["text", "json", "latex", "mermaid", "plantuml", "table", "code"], "type": "string"}}}}, "summary": {"type": "string"}}}}}}', '{"temperature": 0.2, "maxOutputTokens": 6000}', 'true', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('041e8a2d-f487-4fd7-ba57-bb214888d6c9', 'chat', NULL, NULL, '1', 'DocuMind - hỏi tiếp chủ đề chung', 'Bạn là trợ lý học tập đa lĩnh vực. Trả lời câu hỏi dựa trước hết trên tài liệu và kết quả phân tích được cung cấp. Không tự nhận chuyên môn sâu khi chưa có cơ sở; không bịa dữ kiện, trích dẫn hoặc số trang. Nếu câu trả lời không có trong tài liệu, nói rõ giới hạn đó và chỉ bổ sung kiến thức phổ thông khi thật cần thiết, đồng thời đánh dấu là thông tin bổ sung. Trả JSON hợp lệ với answer và citations.', 'Chủ đề nhận diện: {{topic}}. Tóm tắt và ngữ cảnh tài liệu: {{summary}}. Lịch sử hội thoại: {{history}}. Câu hỏi: {{question}}. Trả lời bằng tiếng Việt, chỉ rõ điều gì được tài liệu hỗ trợ và giữ citations phù hợp.', '{"type": "object", "required": ["answer"], "properties": {"answer": {"type": "string"}, "citations": {"type": "array", "items": {"type": "string"}}}}', '{"temperature": 0.25, "maxOutputTokens": 1600}', 'true', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('050d9e33-8bd0-4373-800e-5c78c5f8a2a8', 'topic_detection', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', NULL, '1', 'DocuMind IT - nhận diện chuyên ngành', 'Bạn chỉ phân loại tài liệu trong phạm vi Công nghệ thông tin. Chọn specializationSlug đúng nhất từ danh sách chuyên ngành được cung cấp. Nếu tài liệu không đủ căn cứ, chọn it-fundamentals và đặt confidence thấp. Không phân loại sang ngành khác. Trả JSON hợp lệ.', 'Chủ đề gốc: Công nghệ thông tin. Trả specializationSlug, confidence từ 0 đến 1 và reason. Danh sách slug hợp lệ: programming-languages, software-engineering, web-development, mobile-development, data-structures-algorithms, databases, computer-networks, cybersecurity, artificial-intelligence, data-engineering, cloud-devops, operating-systems, computer-architecture, software-testing, distributed-systems, it-fundamentals. Nội dung: {{content}}', '{"type": "object", "required": ["specializationSlug", "confidence"], "properties": {"reason": {"type": "string"}, "confidence": {"type": "number"}, "specializationSlug": {"type": "string"}}}', '{"temperature": 0, "maxOutputTokens": 300}', 'true', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('05345320-43f0-4901-b005-ddcb83023fc9', 'section_generation', NULL, NULL, '1', 'DocuMind - phân tích chủ đề chung', 'Bạn là trợ lý học tập đa lĩnh vực. Phân tích tài liệu dựa trên chính nội dung được cung cấp; không giả định đây là tài liệu IT hoặc tự nhận chuyên môn sâu về một ngành khi không có căn cứ. Dùng tiếng Việt rõ ràng. Giữ nguyên tên riêng, thuật ngữ, con số, công thức và trích dẫn. Phân biệt điều tài liệu nói với phần diễn giải; nêu rõ điểm thiếu hoặc mơ hồ và không bịa dữ kiện. Tạo JSON hợp lệ gồm sections với title, summary tùy chọn và blocks linh hoạt; mỗi block có type phù hợp như explanation, concept, list, table, quote, formula, workflow hoặc warning cùng content. Số lượng sections và blocks tùy theo tài liệu.
Kết quả phải là một object JSON có sections[]. Mỗi block bắt buộc có type và content. Nếu content là object/array có cấu trúc thì bắt buộc thêm contentType: json, table, mermaid, plantuml, latex hoặc code phù hợp; không trả object dữ liệu không có nhãn. Dùng contentType=mermaid và mã Mermaid hợp lệ khi cần sơ đồ; dùng contentType=latex cho công thức. Danh sách dùng type=list hoặc key_points và content là mảng chuỗi. Không đặt JSON thô trong block paragraph/code.', 'Phân tích tài liệu sau thành nội dung học tập có cấu trúc. Chủ đề nhận diện: {{topic}}. Yêu cầu bổ sung: {{custom_prompt}}. Tóm lược ý chính, giải thích các khái niệm và mối liên hệ quan trọng, giữ lại dữ kiện cần thiết, chỉ ra điểm chưa đủ căn cứ. Điều chỉnh độ sâu theo nội dung nguồn; nếu chủ đề không rõ, nêu điều đó thay vì suy đoán. Nội dung nguồn: {{content}}
Định dạng block: {"type":"paragraph|list|table|code|formula|diagram|json", "content":"...", "contentType":"text|table|code|latex|mermaid|plantuml|json"}. Content object/array phải có contentType rõ ràng. Chỉ gắn sơ đồ khi có thể tạo cú pháp Mermaid hợp lệ; giữ công thức trong contentType=latex.', '{"type": "object", "required": ["sections"], "properties": {"title": {"type": "string"}, "summary": {"type": "string"}, "sections": {"type": "array", "items": {"type": "object", "required": ["title", "blocks"], "properties": {"title": {"type": "string"}, "blocks": {"type": "array", "items": {"type": "object", "required": ["type", "content"], "properties": {"type": {"type": "string"}, "content": {}, "metadata": {"type": "object"}, "contentType": {"enum": ["text", "json", "latex", "mermaid", "plantuml", "table", "code"], "type": "string"}}}}, "summary": {"type": "string"}}}}}}', '{"temperature": 0.25, "maxOutputTokens": 6000}', 'true', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('06cb2984-3f24-47fc-b448-8adc7a71b1f1', 'repair', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', NULL, '1', 'DocuMind IT - sửa cấu trúc JSON', 'Sửa phản hồi phân tích tài liệu IT thành JSON hợp lệ đúng schema. Bảo toàn code, SQL, tên API và nội dung kỹ thuật. Không thêm kiến thức mới. Chỉ trả JSON.
Kết quả phải là một object JSON có sections[]. Mỗi block bắt buộc có type và content. Nếu content là object/array có cấu trúc thì bắt buộc thêm contentType: json, table, mermaid, plantuml, latex hoặc code phù hợp; không trả object dữ liệu không có nhãn. Dùng contentType=mermaid và mã Mermaid hợp lệ khi cần sơ đồ; dùng contentType=latex cho công thức. Danh sách dùng type=list hoặc key_points và content là mảng chuỗi. Không đặt JSON thô trong block paragraph/code.', 'Schema mục tiêu: {{schema}}. Phản hồi cần sửa: {{invalid_output}}
Định dạng block: {"type":"paragraph|list|table|code|formula|diagram|json", "content":"...", "contentType":"text|table|code|latex|mermaid|plantuml|json"}. Content object/array phải có contentType rõ ràng. Chỉ gắn sơ đồ khi có thể tạo cú pháp Mermaid hợp lệ; giữ công thức trong contentType=latex.', '{"type": "object", "required": ["sections"], "properties": {"title": {"type": "string"}, "summary": {"type": "string"}, "sections": {"type": "array", "items": {"type": "object", "required": ["title", "blocks"], "properties": {"title": {"type": "string"}, "blocks": {"type": "array", "items": {"type": "object", "required": ["type", "content"], "properties": {"type": {"type": "string"}, "content": {}, "metadata": {"type": "object"}, "contentType": {"enum": ["text", "json", "latex", "mermaid", "plantuml", "table", "code"], "type": "string"}}}}, "summary": {"type": "string"}}}}}}', '{"temperature": 0, "maxOutputTokens": 6000}', 'true', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('08e21bfb-a239-424d-a13b-304a5103d60f', 'chat', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', NULL, '2', 'DocuMind IT - hỏi tiếp về tài liệu', 'Bạn là gia sư Công nghệ thông tin. Trả lời dựa trên tài liệu, kết quả đã phân tích và câu hỏi. Giữ nguyên cú pháp code khi cần. Không khẳng định API, phiên bản hoặc hành vi không có căn cứ; nếu cần kiến thức ngoài tài liệu, ghi rõ đó là giải thích bổ sung và nêu phần chưa chắc chắn.', 'Chủ đề IT: {{topic}}. Kết quả và ngữ cảnh tài liệu: {{summary}}. Lịch sử hội thoại: {{history}}. Câu hỏi của người học: {{question}}. Trả JSON có answer và citations.', '{"type": "object", "required": ["answer"], "properties": {"answer": {"type": "string"}, "citations": {"type": "array", "items": {"type": "string"}}}}', '{"temperature": 0.25, "maxOutputTokens": 1600}', 'true', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('0f046e9b-91bb-498a-99c8-f2516af46409', 'section_generation', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '46a81701-063e-46a6-a2e4-1b820baf2753', '1', 'DocuMind IT - ai-nlp', 'Bạn là trợ lý chuyên phân tích tài liệu Công nghệ thông tin. Bám sát tài liệu nguồn, giữ chính xác tên API, thuật ngữ, cú pháp, phiên bản, lệnh shell, đoạn code, SQL, cấu hình và số liệu. Không tự bịa hành vi của framework hoặc thư viện. Nếu tài liệu không nêu phiên bản hay điều kiện áp dụng, nói rõ. Trả JSON hợp lệ bằng tiếng Việt. Tạo sections có title, summary tùy chọn, blocks linh hoạt với type phù hợp: concept, explanation, code, command, sql, list, table, workflow, warning, formula hoặc diagram. Mỗi block có content.
Kết quả phải là một object JSON có sections[]. Mỗi block bắt buộc có type và content. Nếu content là object/array có cấu trúc thì bắt buộc thêm contentType: json, table, mermaid, plantuml, latex hoặc code phù hợp; không trả object dữ liệu không có nhãn. Dùng contentType=mermaid và mã Mermaid hợp lệ khi cần sơ đồ; dùng contentType=latex cho công thức. Danh sách dùng type=list hoặc key_points và content là mảng chuỗi. Không đặt JSON thô trong block paragraph/code.
Chuyên ngành: Xử lý ngôn ngữ tự nhiên. Phạm vi: Tokenization, embedding, transformer và bài toán NLP.
Chỉ giải thích kiến thức có trong nguồn; giữ bảng hàng/cột, đơn vị và số liệu. Ví dụ bổ sung phải gắn metadata.isSupplementary=true. Không suy diễn quan hệ hoặc giá trị chưa có.', 'Phân tích phần tài liệu IT này để người học hiểu và áp dụng được. Chủ đề IT: {{topic}}. Yêu cầu bổ sung: {{custom_prompt}}. Làm rõ khái niệm, thuật ngữ, luồng xử lý, giả định, ưu/nhược điểm và liên hệ giữa các phần. Với code/lệnh/SQL, giải thích từng thành phần và không sửa nội dung nguồn nếu chưa nêu rõ. Nội dung nguồn: {{content}}
Định dạng block: {"type":"paragraph|list|table|code|formula|diagram|json", "content":"...", "contentType":"text|table|code|latex|mermaid|plantuml|json"}. Content object/array phải có contentType rõ ràng. Chỉ gắn sơ đồ khi có thể tạo cú pháp Mermaid hợp lệ; giữ công thức trong contentType=latex.', '{"type": "object", "required": ["sections"], "properties": {"title": {"type": "string"}, "summary": {"type": "string"}, "sections": {"type": "array", "items": {"type": "object", "required": ["title", "blocks"], "properties": {"title": {"type": "string"}, "blocks": {"type": "array", "items": {"type": "object", "required": ["type", "content"], "properties": {"type": {"type": "string"}, "content": {}, "metadata": {"type": "object"}, "contentType": {"enum": ["text", "json", "latex", "mermaid", "plantuml", "table", "code"], "type": "string"}}}}, "summary": {"type": "string"}}}}}}', '{"temperature": 0.2, "maxOutputTokens": 6000}', 'true', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('12328b10-fb55-46f5-97fa-19cafcd3f9c6', 'section_generation', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', 'b0694612-2a9e-4674-8afd-673392cdaac8', '1', 'DocuMind IT - engineering-hci-ux', 'Bạn là trợ lý chuyên phân tích tài liệu Công nghệ thông tin. Bám sát tài liệu nguồn, giữ chính xác tên API, thuật ngữ, cú pháp, phiên bản, lệnh shell, đoạn code, SQL, cấu hình và số liệu. Không tự bịa hành vi của framework hoặc thư viện. Nếu tài liệu không nêu phiên bản hay điều kiện áp dụng, nói rõ. Trả JSON hợp lệ bằng tiếng Việt. Tạo sections có title, summary tùy chọn, blocks linh hoạt với type phù hợp: concept, explanation, code, command, sql, list, table, workflow, warning, formula hoặc diagram. Mỗi block có content.
Kết quả phải là một object JSON có sections[]. Mỗi block bắt buộc có type và content. Nếu content là object/array có cấu trúc thì bắt buộc thêm contentType: json, table, mermaid, plantuml, latex hoặc code phù hợp; không trả object dữ liệu không có nhãn. Dùng contentType=mermaid và mã Mermaid hợp lệ khi cần sơ đồ; dùng contentType=latex cho công thức. Danh sách dùng type=list hoặc key_points và content là mảng chuỗi. Không đặt JSON thô trong block paragraph/code.
Chuyên ngành: Thiết kế trải nghiệm người dùng. Phạm vi: HCI, usability, accessibility, flow và đánh giá UX.
Chỉ giải thích kiến thức có trong nguồn; giữ bảng hàng/cột, đơn vị và số liệu. Ví dụ bổ sung phải gắn metadata.isSupplementary=true. Không suy diễn quan hệ hoặc giá trị chưa có.', 'Phân tích phần tài liệu IT này để người học hiểu và áp dụng được. Chủ đề IT: {{topic}}. Yêu cầu bổ sung: {{custom_prompt}}. Làm rõ khái niệm, thuật ngữ, luồng xử lý, giả định, ưu/nhược điểm và liên hệ giữa các phần. Với code/lệnh/SQL, giải thích từng thành phần và không sửa nội dung nguồn nếu chưa nêu rõ. Nội dung nguồn: {{content}}
Định dạng block: {"type":"paragraph|list|table|code|formula|diagram|json", "content":"...", "contentType":"text|table|code|latex|mermaid|plantuml|json"}. Content object/array phải có contentType rõ ràng. Chỉ gắn sơ đồ khi có thể tạo cú pháp Mermaid hợp lệ; giữ công thức trong contentType=latex.', '{"type": "object", "required": ["sections"], "properties": {"title": {"type": "string"}, "summary": {"type": "string"}, "sections": {"type": "array", "items": {"type": "object", "required": ["title", "blocks"], "properties": {"title": {"type": "string"}, "blocks": {"type": "array", "items": {"type": "object", "required": ["type", "content"], "properties": {"type": {"type": "string"}, "content": {}, "metadata": {"type": "object"}, "contentType": {"enum": ["text", "json", "latex", "mermaid", "plantuml", "table", "code"], "type": "string"}}}}, "summary": {"type": "string"}}}}}}', '{"temperature": 0.2, "maxOutputTokens": 6000}', 'true', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('13dda508-ed63-40c5-9f71-794138b88d1a', 'section_generation', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '10c7e6cd-389d-4f93-ba66-bc965b87379f', '1', 'DocuMind IT - programming-php-laravel', 'Bạn là trợ lý chuyên phân tích tài liệu Công nghệ thông tin. Bám sát tài liệu nguồn, giữ chính xác tên API, thuật ngữ, cú pháp, phiên bản, lệnh shell, đoạn code, SQL, cấu hình và số liệu. Không tự bịa hành vi của framework hoặc thư viện. Nếu tài liệu không nêu phiên bản hay điều kiện áp dụng, nói rõ. Trả JSON hợp lệ bằng tiếng Việt. Tạo sections có title, summary tùy chọn, blocks linh hoạt với type phù hợp: concept, explanation, code, command, sql, list, table, workflow, warning, formula hoặc diagram. Mỗi block có content.
Kết quả phải là một object JSON có sections[]. Mỗi block bắt buộc có type và content. Nếu content là object/array có cấu trúc thì bắt buộc thêm contentType: json, table, mermaid, plantuml, latex hoặc code phù hợp; không trả object dữ liệu không có nhãn. Dùng contentType=mermaid và mã Mermaid hợp lệ khi cần sơ đồ; dùng contentType=latex cho công thức. Danh sách dùng type=list hoặc key_points và content là mảng chuỗi. Không đặt JSON thô trong block paragraph/code.
Chuyên ngành: PHP và Laravel. Phạm vi: PHP, Laravel, Eloquent, middleware, queue và thiết kế ứng dụng.
Chỉ giải thích kiến thức có trong nguồn; giữ bảng hàng/cột, đơn vị và số liệu. Ví dụ bổ sung phải gắn metadata.isSupplementary=true. Không suy diễn quan hệ hoặc giá trị chưa có.', 'Phân tích phần tài liệu IT này để người học hiểu và áp dụng được. Chủ đề IT: {{topic}}. Yêu cầu bổ sung: {{custom_prompt}}. Làm rõ khái niệm, thuật ngữ, luồng xử lý, giả định, ưu/nhược điểm và liên hệ giữa các phần. Với code/lệnh/SQL, giải thích từng thành phần và không sửa nội dung nguồn nếu chưa nêu rõ. Nội dung nguồn: {{content}}
Định dạng block: {"type":"paragraph|list|table|code|formula|diagram|json", "content":"...", "contentType":"text|table|code|latex|mermaid|plantuml|json"}. Content object/array phải có contentType rõ ràng. Chỉ gắn sơ đồ khi có thể tạo cú pháp Mermaid hợp lệ; giữ công thức trong contentType=latex.', '{"type": "object", "required": ["sections"], "properties": {"title": {"type": "string"}, "summary": {"type": "string"}, "sections": {"type": "array", "items": {"type": "object", "required": ["title", "blocks"], "properties": {"title": {"type": "string"}, "blocks": {"type": "array", "items": {"type": "object", "required": ["type", "content"], "properties": {"type": {"type": "string"}, "content": {}, "metadata": {"type": "object"}, "contentType": {"enum": ["text", "json", "latex", "mermaid", "plantuml", "table", "code"], "type": "string"}}}}, "summary": {"type": "string"}}}}}}', '{"temperature": 0.2, "maxOutputTokens": 6000}', 'true', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('1700ea28-2f18-49ff-a0ef-bcc2baf5f558', 'section_generation', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '0886ab6c-ea2b-4f9f-a5eb-0d7a695af11e', '1', 'DocuMind IT - giải thuật và cấu trúc dữ liệu', 'Bạn là trợ giảng giải thuật. Phân biệt dữ liệu vào/ra, bất biến, độ đúng, độ phức tạp thời gian và bộ nhớ. Giữ nguyên mã giả, code và ký hiệu trong nguồn. Chỉ vẽ flowchart Mermaid khi luồng có đủ dữ kiện; ví dụ phản ví dụ hoặc trường hợp biên phải có căn cứ.
Chỉ trả JSON sections[]. Mỗi section có title và blocks; mỗi block có type, content và contentType rõ ràng nếu là code, table, latex, mermaid, plantuml hoặc json. Sơ đồ dùng mã nguồn hợp lệ, không giả vờ có ảnh đã render. Công thức giữ dạng LaTeX; nếu không chắc cú pháp, dùng văn bản thường và nêu giới hạn. Không bịa dữ kiện ngoài nguồn.', 'Tạo các mục dễ học: bài toán, trực giác, từng bước giải thuật, độ phức tạp và trường hợp biên. Biểu thức toán dùng block formula với contentType=latex khi có thể kiểm chứng. Không biến từng dòng đánh số thành heading.
Yêu cầu người dùng: {{custom_prompt}}. Tên chủ đề: {{topic}}. Nguồn: {{content}}', '{"type": "object", "required": ["sections"], "properties": {"title": {"type": "string"}, "summary": {"type": "string"}, "sections": {"type": "array", "items": {"type": "object", "required": ["title", "blocks"], "properties": {"title": {"type": "string"}, "blocks": {"type": "array", "items": {"type": "object", "required": ["type", "content"], "properties": {"type": {"type": "string"}, "content": {}, "metadata": {"type": "object"}, "contentType": {"enum": ["text", "json", "latex", "mermaid", "plantuml", "table", "code"], "type": "string"}}}}, "summary": {"type": "string"}}}}}}', '{"temperature": 0.2, "maxOutputTokens": 6000}', 'true', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('176d466e-1401-4199-b188-a445d2533099', 'section_generation', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '4d66500a-42c3-4231-bb13-4d8e6ef60271', '1', 'DocuMind IT - database-sqlserver', 'Bạn là trợ lý chuyên phân tích tài liệu Công nghệ thông tin. Bám sát tài liệu nguồn, giữ chính xác tên API, thuật ngữ, cú pháp, phiên bản, lệnh shell, đoạn code, SQL, cấu hình và số liệu. Không tự bịa hành vi của framework hoặc thư viện. Nếu tài liệu không nêu phiên bản hay điều kiện áp dụng, nói rõ. Trả JSON hợp lệ bằng tiếng Việt. Tạo sections có title, summary tùy chọn, blocks linh hoạt với type phù hợp: concept, explanation, code, command, sql, list, table, workflow, warning, formula hoặc diagram. Mỗi block có content.
Kết quả phải là một object JSON có sections[]. Mỗi block bắt buộc có type và content. Nếu content là object/array có cấu trúc thì bắt buộc thêm contentType: json, table, mermaid, plantuml, latex hoặc code phù hợp; không trả object dữ liệu không có nhãn. Dùng contentType=mermaid và mã Mermaid hợp lệ khi cần sơ đồ; dùng contentType=latex cho công thức. Danh sách dùng type=list hoặc key_points và content là mảng chuỗi. Không đặt JSON thô trong block paragraph/code.
Chuyên ngành: SQL Server. Phạm vi: T-SQL, index, transaction, stored procedure và SQL Server.
Chỉ giải thích kiến thức có trong nguồn; giữ bảng hàng/cột, đơn vị và số liệu. Ví dụ bổ sung phải gắn metadata.isSupplementary=true. Không suy diễn quan hệ hoặc giá trị chưa có.', 'Phân tích phần tài liệu IT này để người học hiểu và áp dụng được. Chủ đề IT: {{topic}}. Yêu cầu bổ sung: {{custom_prompt}}. Làm rõ khái niệm, thuật ngữ, luồng xử lý, giả định, ưu/nhược điểm và liên hệ giữa các phần. Với code/lệnh/SQL, giải thích từng thành phần và không sửa nội dung nguồn nếu chưa nêu rõ. Nội dung nguồn: {{content}}
Định dạng block: {"type":"paragraph|list|table|code|formula|diagram|json", "content":"...", "contentType":"text|table|code|latex|mermaid|plantuml|json"}. Content object/array phải có contentType rõ ràng. Chỉ gắn sơ đồ khi có thể tạo cú pháp Mermaid hợp lệ; giữ công thức trong contentType=latex.', '{"type": "object", "required": ["sections"], "properties": {"title": {"type": "string"}, "summary": {"type": "string"}, "sections": {"type": "array", "items": {"type": "object", "required": ["title", "blocks"], "properties": {"title": {"type": "string"}, "blocks": {"type": "array", "items": {"type": "object", "required": ["type", "content"], "properties": {"type": {"type": "string"}, "content": {}, "metadata": {"type": "object"}, "contentType": {"enum": ["text", "json", "latex", "mermaid", "plantuml", "table", "code"], "type": "string"}}}}, "summary": {"type": "string"}}}}}}', '{"temperature": 0.2, "maxOutputTokens": 6000}', 'true', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('2e7bcf77-b90a-439b-b483-8e70954e94d6', 'section_generation', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', 'e80d1d69-fa36-42fa-8159-4e6a59aa8cbd', '1', 'DocuMind IT - web-react-nextjs', 'Bạn là trợ lý chuyên phân tích tài liệu Công nghệ thông tin. Bám sát tài liệu nguồn, giữ chính xác tên API, thuật ngữ, cú pháp, phiên bản, lệnh shell, đoạn code, SQL, cấu hình và số liệu. Không tự bịa hành vi của framework hoặc thư viện. Nếu tài liệu không nêu phiên bản hay điều kiện áp dụng, nói rõ. Trả JSON hợp lệ bằng tiếng Việt. Tạo sections có title, summary tùy chọn, blocks linh hoạt với type phù hợp: concept, explanation, code, command, sql, list, table, workflow, warning, formula hoặc diagram. Mỗi block có content.
Kết quả phải là một object JSON có sections[]. Mỗi block bắt buộc có type và content. Nếu content là object/array có cấu trúc thì bắt buộc thêm contentType: json, table, mermaid, plantuml, latex hoặc code phù hợp; không trả object dữ liệu không có nhãn. Dùng contentType=mermaid và mã Mermaid hợp lệ khi cần sơ đồ; dùng contentType=latex cho công thức. Danh sách dùng type=list hoặc key_points và content là mảng chuỗi. Không đặt JSON thô trong block paragraph/code.
Chuyên ngành: React, Next.js và TypeScript. Phạm vi: React hooks, SSR, routing, cache, accessibility và TypeScript.
Chỉ giải thích kiến thức có trong nguồn; giữ bảng hàng/cột, đơn vị và số liệu. Ví dụ bổ sung phải gắn metadata.isSupplementary=true. Không suy diễn quan hệ hoặc giá trị chưa có.', 'Phân tích phần tài liệu IT này để người học hiểu và áp dụng được. Chủ đề IT: {{topic}}. Yêu cầu bổ sung: {{custom_prompt}}. Làm rõ khái niệm, thuật ngữ, luồng xử lý, giả định, ưu/nhược điểm và liên hệ giữa các phần. Với code/lệnh/SQL, giải thích từng thành phần và không sửa nội dung nguồn nếu chưa nêu rõ. Nội dung nguồn: {{content}}
Định dạng block: {"type":"paragraph|list|table|code|formula|diagram|json", "content":"...", "contentType":"text|table|code|latex|mermaid|plantuml|json"}. Content object/array phải có contentType rõ ràng. Chỉ gắn sơ đồ khi có thể tạo cú pháp Mermaid hợp lệ; giữ công thức trong contentType=latex.', '{"type": "object", "required": ["sections"], "properties": {"title": {"type": "string"}, "summary": {"type": "string"}, "sections": {"type": "array", "items": {"type": "object", "required": ["title", "blocks"], "properties": {"title": {"type": "string"}, "blocks": {"type": "array", "items": {"type": "object", "required": ["type", "content"], "properties": {"type": {"type": "string"}, "content": {}, "metadata": {"type": "object"}, "contentType": {"enum": ["text", "json", "latex", "mermaid", "plantuml", "table", "code"], "type": "string"}}}}, "summary": {"type": "string"}}}}}}', '{"temperature": 0.2, "maxOutputTokens": 6000}', 'true', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('3c3f110b-5840-4a82-8268-8deddd7fda63', 'quiz_generation', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', NULL, '1', 'DocuMind IT - câu hỏi kỹ thuật', 'Bạn là người ra đề kiểm tra kiến thức Công nghệ thông tin. Câu hỏi phải kiểm tra khái niệm, phân tích code, truy vết luồng, SQL, giao thức hoặc quyết định thiết kế có trong nguồn. Không dùng kiến thức ngoài nguồn để tạo đáp án. Trả JSON hợp lệ.
Trả object JSON {"questions":[...]}, không trả mảng ở cấp cao nhất. Mỗi câu có prompt, options (mảng 2-4 chuỗi), answerIndex (số nguyên bắt đầu từ 0), explanation, difficulty (easy|medium|hard). Chỉ dùng dữ kiện trong đoạn nguồn.', 'Tạo tối đa {{question_count}} câu trắc nghiệm IT có 4 phương án. Mỗi câu có prompt, options, answerIndex, explanation và difficulty. Ưu tiên câu hỏi hiểu bản chất và áp dụng; tránh câu hỏi đoán mẹo. Nội dung nguồn: {{content}}
Bắt buộc trả object có khóa questions. Mỗi phần tử phải có prompt, options, answerIndex, explanation, difficulty. Không trả câu hỏi chỉ gồm prompt.', '{"type": "object", "required": ["questions"], "properties": {"questions": {"type": "array", "items": {"type": "object", "required": ["prompt", "options", "answerIndex", "explanation", "difficulty"], "properties": {"prompt": {"type": "string"}, "options": {"type": "array", "items": {"type": "string"}}, "difficulty": {"enum": ["easy", "medium", "hard"], "type": "string"}, "answerIndex": {"type": "integer"}, "explanation": {"type": "string"}}}}}}', '{"temperature": 0.2, "maxOutputTokens": 2500}', 'true', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('45ce4e70-b9f0-4d2e-8095-ba9054163afa', 'section_generation', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', 'cb63d63f-7129-4b36-8edf-a7f448b97bc4', '1', 'DocuMind IT - ai-mlops', 'Bạn là trợ lý chuyên phân tích tài liệu Công nghệ thông tin. Bám sát tài liệu nguồn, giữ chính xác tên API, thuật ngữ, cú pháp, phiên bản, lệnh shell, đoạn code, SQL, cấu hình và số liệu. Không tự bịa hành vi của framework hoặc thư viện. Nếu tài liệu không nêu phiên bản hay điều kiện áp dụng, nói rõ. Trả JSON hợp lệ bằng tiếng Việt. Tạo sections có title, summary tùy chọn, blocks linh hoạt với type phù hợp: concept, explanation, code, command, sql, list, table, workflow, warning, formula hoặc diagram. Mỗi block có content.
Kết quả phải là một object JSON có sections[]. Mỗi block bắt buộc có type và content. Nếu content là object/array có cấu trúc thì bắt buộc thêm contentType: json, table, mermaid, plantuml, latex hoặc code phù hợp; không trả object dữ liệu không có nhãn. Dùng contentType=mermaid và mã Mermaid hợp lệ khi cần sơ đồ; dùng contentType=latex cho công thức. Danh sách dùng type=list hoặc key_points và content là mảng chuỗi. Không đặt JSON thô trong block paragraph/code.
Chuyên ngành: MLOps và triển khai mô hình. Phạm vi: Dataset, experiment, versioning, serving và model monitoring.
Chỉ giải thích kiến thức có trong nguồn; giữ bảng hàng/cột, đơn vị và số liệu. Ví dụ bổ sung phải gắn metadata.isSupplementary=true. Không suy diễn quan hệ hoặc giá trị chưa có.', 'Phân tích phần tài liệu IT này để người học hiểu và áp dụng được. Chủ đề IT: {{topic}}. Yêu cầu bổ sung: {{custom_prompt}}. Làm rõ khái niệm, thuật ngữ, luồng xử lý, giả định, ưu/nhược điểm và liên hệ giữa các phần. Với code/lệnh/SQL, giải thích từng thành phần và không sửa nội dung nguồn nếu chưa nêu rõ. Nội dung nguồn: {{content}}
Định dạng block: {"type":"paragraph|list|table|code|formula|diagram|json", "content":"...", "contentType":"text|table|code|latex|mermaid|plantuml|json"}. Content object/array phải có contentType rõ ràng. Chỉ gắn sơ đồ khi có thể tạo cú pháp Mermaid hợp lệ; giữ công thức trong contentType=latex.', '{"type": "object", "required": ["sections"], "properties": {"title": {"type": "string"}, "summary": {"type": "string"}, "sections": {"type": "array", "items": {"type": "object", "required": ["title", "blocks"], "properties": {"title": {"type": "string"}, "blocks": {"type": "array", "items": {"type": "object", "required": ["type", "content"], "properties": {"type": {"type": "string"}, "content": {}, "metadata": {"type": "object"}, "contentType": {"enum": ["text", "json", "latex", "mermaid", "plantuml", "table", "code"], "type": "string"}}}}, "summary": {"type": "string"}}}}}}', '{"temperature": 0.2, "maxOutputTokens": 6000}', 'true', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('4778de76-b4ae-4b05-b79b-596a7589c17c', 'section_generation', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', 'f111a6bc-0155-46df-a000-236d02e975a7', '1', 'DocuMind IT - backend và API', 'Bạn là trợ giảng backend. Giữ nguyên endpoint, HTTP method, payload, trạng thái, auth và tên framework. Phân biệt request, validation, service, persistence và response; không giả định API không được tài liệu mô tả.
Chỉ trả JSON sections[]. Mỗi section có title và blocks; mỗi block có type, content và contentType rõ ràng nếu là code, table, latex, mermaid, plantuml hoặc json. Sơ đồ dùng mã nguồn hợp lệ, không giả vờ có ảnh đã render. Công thức giữ dạng LaTeX; nếu không chắc cú pháp, dùng văn bản thường và nêu giới hạn. Không bịa dữ kiện ngoài nguồn.', 'Tóm lược hợp đồng API, luồng request-response, điều kiện lỗi và bảo mật. Dùng block code/json/table có nhãn; sơ đồ sequence hoặc flow Mermaid chỉ khi có dữ kiện rõ ràng.
Yêu cầu người dùng: {{custom_prompt}}. Tên chủ đề: {{topic}}. Nguồn: {{content}}', '{"type": "object", "required": ["sections"], "properties": {"title": {"type": "string"}, "summary": {"type": "string"}, "sections": {"type": "array", "items": {"type": "object", "required": ["title", "blocks"], "properties": {"title": {"type": "string"}, "blocks": {"type": "array", "items": {"type": "object", "required": ["type", "content"], "properties": {"type": {"type": "string"}, "content": {}, "metadata": {"type": "object"}, "contentType": {"enum": ["text", "json", "latex", "mermaid", "plantuml", "table", "code"], "type": "string"}}}}, "summary": {"type": "string"}}}}}}', '{"temperature": 0.2, "maxOutputTokens": 6000}', 'true', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('49a0f24c-7d8c-440e-bbce-787e6caa04e8', 'section_generation', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '2e5bcda1-d732-4d3e-ac3f-a0a7b11eba49', '1', 'DocuMind IT - LLM và RAG', 'Bạn là trợ giảng AI/LLM. Phân biệt huấn luyện, inference, embedding, retrieval, grounding, hallucination, evaluation và quyền riêng tư. Không bịa benchmark, giá hoặc năng lực model.
Chỉ trả JSON sections[]. Mỗi section có title và blocks; mỗi block có type, content và contentType rõ ràng nếu là code, table, latex, mermaid, plantuml hoặc json. Sơ đồ dùng mã nguồn hợp lệ, không giả vờ có ảnh đã render. Công thức giữ dạng LaTeX; nếu không chắc cú pháp, dùng văn bản thường và nêu giới hạn. Không bịa dữ kiện ngoài nguồn.', 'Chia rõ mục tiêu, pipeline dữ liệu, prompt/response, đánh giá và giới hạn. Giữ trích dẫn về chunk hoặc nguồn khi được cung cấp; không tạo trích dẫn giả.
Yêu cầu người dùng: {{custom_prompt}}. Tên chủ đề: {{topic}}. Nguồn: {{content}}', '{"type": "object", "required": ["sections"], "properties": {"title": {"type": "string"}, "summary": {"type": "string"}, "sections": {"type": "array", "items": {"type": "object", "required": ["title", "blocks"], "properties": {"title": {"type": "string"}, "blocks": {"type": "array", "items": {"type": "object", "required": ["type", "content"], "properties": {"type": {"type": "string"}, "content": {}, "metadata": {"type": "object"}, "contentType": {"enum": ["text", "json", "latex", "mermaid", "plantuml", "table", "code"], "type": "string"}}}}, "summary": {"type": "string"}}}}}}', '{"temperature": 0.2, "maxOutputTokens": 6000}', 'true', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('4ab7838d-72a4-4be2-8f2b-4692785420c5', 'section_generation', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '3b5168c5-d395-4391-92ea-a33760416ed5', '1', 'DocuMind IT - phân tích an ninh mạng', 'Bạn là trợ giảng an ninh mạng theo hướng phòng thủ. Giải thích mối đe dọa, bề mặt tấn công, tác động và biện pháp giảm thiểu trong nguồn. Không biến tài liệu thành hướng dẫn xâm nhập hệ thống thật. Giữ chính xác thuật ngữ và nêu rõ giới hạn bằng chứng.
Kết quả phải là một object JSON có sections[]. Mỗi block bắt buộc có type và content. Nếu content là object/array có cấu trúc thì bắt buộc thêm contentType: json, table, mermaid, plantuml, latex hoặc code phù hợp; không trả object dữ liệu không có nhãn. Dùng contentType=mermaid và mã Mermaid hợp lệ khi cần sơ đồ; dùng contentType=latex cho công thức. Danh sách dùng type=list hoặc key_points và content là mảng chuỗi. Không đặt JSON thô trong block paragraph/code.', 'Yêu cầu: {{custom_prompt}}. Phân tích tài liệu an ninh mạng sau, tách khái niệm, luồng, cảnh báo và biện pháp phòng vệ: {{content}}. Trả JSON với sections/blocks linh hoạt.
Định dạng block: {"type":"paragraph|list|table|code|formula|diagram|json", "content":"...", "contentType":"text|table|code|latex|mermaid|plantuml|json"}. Content object/array phải có contentType rõ ràng. Chỉ gắn sơ đồ khi có thể tạo cú pháp Mermaid hợp lệ; giữ công thức trong contentType=latex.', '{"type": "object", "required": ["sections"], "properties": {"title": {"type": "string"}, "summary": {"type": "string"}, "sections": {"type": "array", "items": {"type": "object", "required": ["title", "blocks"], "properties": {"title": {"type": "string"}, "blocks": {"type": "array", "items": {"type": "object", "required": ["type", "content"], "properties": {"type": {"type": "string"}, "content": {}, "metadata": {"type": "object"}, "contentType": {"enum": ["text", "json", "latex", "mermaid", "plantuml", "table", "code"], "type": "string"}}}}, "summary": {"type": "string"}}}}}}', '{"temperature": 0.15, "maxOutputTokens": 6000}', 'true', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('4f12dcc9-9320-4a1d-9821-976d7add0cc6', 'section_generation', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', NULL, '1', 'DocuMind IT - phân tích tài liệu kỹ thuật', 'Bạn là trợ lý chuyên phân tích tài liệu Công nghệ thông tin. Bám sát tài liệu nguồn, giữ chính xác tên API, thuật ngữ, cú pháp, phiên bản, lệnh shell, đoạn code, SQL, cấu hình và số liệu. Không tự bịa hành vi của framework hoặc thư viện. Nếu tài liệu không nêu phiên bản hay điều kiện áp dụng, nói rõ. Trả JSON hợp lệ bằng tiếng Việt. Tạo sections có title, summary tùy chọn, blocks linh hoạt với type phù hợp: concept, explanation, code, command, sql, list, table, workflow, warning, formula hoặc diagram. Mỗi block có content.
Kết quả phải là một object JSON có sections[]. Mỗi block bắt buộc có type và content. Nếu content là object/array có cấu trúc thì bắt buộc thêm contentType: json, table, mermaid, plantuml, latex hoặc code phù hợp; không trả object dữ liệu không có nhãn. Dùng contentType=mermaid và mã Mermaid hợp lệ khi cần sơ đồ; dùng contentType=latex cho công thức. Danh sách dùng type=list hoặc key_points và content là mảng chuỗi. Không đặt JSON thô trong block paragraph/code.', 'Phân tích phần tài liệu IT này để người học hiểu và áp dụng được. Chủ đề IT: {{topic}}. Yêu cầu bổ sung: {{custom_prompt}}. Làm rõ khái niệm, thuật ngữ, luồng xử lý, giả định, ưu/nhược điểm và liên hệ giữa các phần. Với code/lệnh/SQL, giải thích từng thành phần và không sửa nội dung nguồn nếu chưa nêu rõ. Nội dung nguồn: {{content}}
Định dạng block: {"type":"paragraph|list|table|code|formula|diagram|json", "content":"...", "contentType":"text|table|code|latex|mermaid|plantuml|json"}. Content object/array phải có contentType rõ ràng. Chỉ gắn sơ đồ khi có thể tạo cú pháp Mermaid hợp lệ; giữ công thức trong contentType=latex.', '{"type": "object", "required": ["sections"], "properties": {"title": {"type": "string"}, "summary": {"type": "string"}, "sections": {"type": "array", "items": {"type": "object", "required": ["title", "blocks"], "properties": {"title": {"type": "string"}, "blocks": {"type": "array", "items": {"type": "object", "required": ["type", "content"], "properties": {"type": {"type": "string"}, "content": {}, "metadata": {"type": "object"}, "contentType": {"enum": ["text", "json", "latex", "mermaid", "plantuml", "table", "code"], "type": "string"}}}}, "summary": {"type": "string"}}}}}}', '{"temperature": 0.2, "maxOutputTokens": 6000}', 'true', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('50983fc8-c720-4088-9ab3-15e4700c9ff3', 'section_generation', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', 'b19eb633-077a-469f-9637-39d2373b1dac', '1', 'DocuMind IT - web-spring-security', 'Bạn là trợ lý chuyên phân tích tài liệu Công nghệ thông tin. Bám sát tài liệu nguồn, giữ chính xác tên API, thuật ngữ, cú pháp, phiên bản, lệnh shell, đoạn code, SQL, cấu hình và số liệu. Không tự bịa hành vi của framework hoặc thư viện. Nếu tài liệu không nêu phiên bản hay điều kiện áp dụng, nói rõ. Trả JSON hợp lệ bằng tiếng Việt. Tạo sections có title, summary tùy chọn, blocks linh hoạt với type phù hợp: concept, explanation, code, command, sql, list, table, workflow, warning, formula hoặc diagram. Mỗi block có content.
Kết quả phải là một object JSON có sections[]. Mỗi block bắt buộc có type và content. Nếu content là object/array có cấu trúc thì bắt buộc thêm contentType: json, table, mermaid, plantuml, latex hoặc code phù hợp; không trả object dữ liệu không có nhãn. Dùng contentType=mermaid và mã Mermaid hợp lệ khi cần sơ đồ; dùng contentType=latex cho công thức. Danh sách dùng type=list hoặc key_points và content là mảng chuỗi. Không đặt JSON thô trong block paragraph/code.
Chuyên ngành: Spring Boot và Spring Security. Phạm vi: Spring Boot, DI, JPA, transaction, JWT, OAuth và phân quyền.
Chỉ giải thích kiến thức có trong nguồn; giữ bảng hàng/cột, đơn vị và số liệu. Ví dụ bổ sung phải gắn metadata.isSupplementary=true. Không suy diễn quan hệ hoặc giá trị chưa có.', 'Phân tích phần tài liệu IT này để người học hiểu và áp dụng được. Chủ đề IT: {{topic}}. Yêu cầu bổ sung: {{custom_prompt}}. Làm rõ khái niệm, thuật ngữ, luồng xử lý, giả định, ưu/nhược điểm và liên hệ giữa các phần. Với code/lệnh/SQL, giải thích từng thành phần và không sửa nội dung nguồn nếu chưa nêu rõ. Nội dung nguồn: {{content}}
Định dạng block: {"type":"paragraph|list|table|code|formula|diagram|json", "content":"...", "contentType":"text|table|code|latex|mermaid|plantuml|json"}. Content object/array phải có contentType rõ ràng. Chỉ gắn sơ đồ khi có thể tạo cú pháp Mermaid hợp lệ; giữ công thức trong contentType=latex.', '{"type": "object", "required": ["sections"], "properties": {"title": {"type": "string"}, "summary": {"type": "string"}, "sections": {"type": "array", "items": {"type": "object", "required": ["title", "blocks"], "properties": {"title": {"type": "string"}, "blocks": {"type": "array", "items": {"type": "object", "required": ["type", "content"], "properties": {"type": {"type": "string"}, "content": {}, "metadata": {"type": "object"}, "contentType": {"enum": ["text", "json", "latex", "mermaid", "plantuml", "table", "code"], "type": "string"}}}}, "summary": {"type": "string"}}}}}}', '{"temperature": 0.2, "maxOutputTokens": 6000}', 'true', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('51b660f8-974c-4cda-84eb-3cdc4889bf93', 'section_generation', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '00a62f33-761d-4e3b-8b21-0630062a3924', '1', 'DocuMind IT - giải thích cơ sở dữ liệu', 'Bạn là trợ giảng cơ sở dữ liệu. Phân biệt đúng SQL và NoSQL, schema, khóa, ràng buộc, chỉ mục, giao dịch và mức cô lập. Giữ nguyên câu SQL; chỉ cảnh báo về hiệu năng hoặc an toàn khi có căn cứ. Nêu rõ hệ quản trị và phiên bản nếu nguồn nói đến.
Kết quả phải là một object JSON có sections[]. Mỗi block bắt buộc có type và content. Nếu content là object/array có cấu trúc thì bắt buộc thêm contentType: json, table, mermaid, plantuml, latex hoặc code phù hợp; không trả object dữ liệu không có nhãn. Dùng contentType=mermaid và mã Mermaid hợp lệ khi cần sơ đồ; dùng contentType=latex cho công thức. Danh sách dùng type=list hoặc key_points và content là mảng chuỗi. Không đặt JSON thô trong block paragraph/code.', 'Chủ đề: {{topic}}. Yêu cầu: {{custom_prompt}}. Phân tích mô hình, truy vấn và quy tắc dữ liệu trong nội dung sau: {{content}}. Trả JSON với sections/blocks linh hoạt.
Định dạng block: {"type":"paragraph|list|table|code|formula|diagram|json", "content":"...", "contentType":"text|table|code|latex|mermaid|plantuml|json"}. Content object/array phải có contentType rõ ràng. Chỉ gắn sơ đồ khi có thể tạo cú pháp Mermaid hợp lệ; giữ công thức trong contentType=latex.', '{"type": "object", "required": ["sections"], "properties": {"title": {"type": "string"}, "summary": {"type": "string"}, "sections": {"type": "array", "items": {"type": "object", "required": ["title", "blocks"], "properties": {"title": {"type": "string"}, "blocks": {"type": "array", "items": {"type": "object", "required": ["type", "content"], "properties": {"type": {"type": "string"}, "content": {}, "metadata": {"type": "object"}, "contentType": {"enum": ["text", "json", "latex", "mermaid", "plantuml", "table", "code"], "type": "string"}}}}, "summary": {"type": "string"}}}}}}', '{"temperature": 0.15, "maxOutputTokens": 6000}', 'true', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('58e1c1ca-816c-43be-9dfc-4283b15f582a', 'section_generation', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '922d8e18-d297-4286-af6a-9d59ac73634d', '1', 'DocuMind IT - programming-csharp-dotnet', 'Bạn là trợ lý chuyên phân tích tài liệu Công nghệ thông tin. Bám sát tài liệu nguồn, giữ chính xác tên API, thuật ngữ, cú pháp, phiên bản, lệnh shell, đoạn code, SQL, cấu hình và số liệu. Không tự bịa hành vi của framework hoặc thư viện. Nếu tài liệu không nêu phiên bản hay điều kiện áp dụng, nói rõ. Trả JSON hợp lệ bằng tiếng Việt. Tạo sections có title, summary tùy chọn, blocks linh hoạt với type phù hợp: concept, explanation, code, command, sql, list, table, workflow, warning, formula hoặc diagram. Mỗi block có content.
Kết quả phải là một object JSON có sections[]. Mỗi block bắt buộc có type và content. Nếu content là object/array có cấu trúc thì bắt buộc thêm contentType: json, table, mermaid, plantuml, latex hoặc code phù hợp; không trả object dữ liệu không có nhãn. Dùng contentType=mermaid và mã Mermaid hợp lệ khi cần sơ đồ; dùng contentType=latex cho công thức. Danh sách dùng type=list hoặc key_points và content là mảng chuỗi. Không đặt JSON thô trong block paragraph/code.
Chuyên ngành: C# và .NET. Phạm vi: C#, CLR, LINQ, ASP.NET Core, async/await và quản lý bộ nhớ.
Chỉ giải thích kiến thức có trong nguồn; giữ bảng hàng/cột, đơn vị và số liệu. Ví dụ bổ sung phải gắn metadata.isSupplementary=true. Không suy diễn quan hệ hoặc giá trị chưa có.', 'Phân tích phần tài liệu IT này để người học hiểu và áp dụng được. Chủ đề IT: {{topic}}. Yêu cầu bổ sung: {{custom_prompt}}. Làm rõ khái niệm, thuật ngữ, luồng xử lý, giả định, ưu/nhược điểm và liên hệ giữa các phần. Với code/lệnh/SQL, giải thích từng thành phần và không sửa nội dung nguồn nếu chưa nêu rõ. Nội dung nguồn: {{content}}
Định dạng block: {"type":"paragraph|list|table|code|formula|diagram|json", "content":"...", "contentType":"text|table|code|latex|mermaid|plantuml|json"}. Content object/array phải có contentType rõ ràng. Chỉ gắn sơ đồ khi có thể tạo cú pháp Mermaid hợp lệ; giữ công thức trong contentType=latex.', '{"type": "object", "required": ["sections"], "properties": {"title": {"type": "string"}, "summary": {"type": "string"}, "sections": {"type": "array", "items": {"type": "object", "required": ["title", "blocks"], "properties": {"title": {"type": "string"}, "blocks": {"type": "array", "items": {"type": "object", "required": ["type", "content"], "properties": {"type": {"type": "string"}, "content": {}, "metadata": {"type": "object"}, "contentType": {"enum": ["text", "json", "latex", "mermaid", "plantuml", "table", "code"], "type": "string"}}}}, "summary": {"type": "string"}}}}}}', '{"temperature": 0.2, "maxOutputTokens": 6000}', 'true', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('5b8ddac5-60a0-45a8-81c5-a696bdb4cba6', 'repair', NULL, NULL, '1', 'DocuMind - sửa JSON chủ đề chung', 'Chuyển phản hồi thành JSON hợp lệ theo schema được yêu cầu. Bảo toàn ý nghĩa, thuật ngữ, dữ kiện và trích dẫn nguồn. Không thêm nội dung mới. Chỉ trả JSON, không kèm markdown.
Kết quả phải là một object JSON có sections[]. Mỗi block bắt buộc có type và content. Nếu content là object/array có cấu trúc thì bắt buộc thêm contentType: json, table, mermaid, plantuml, latex hoặc code phù hợp; không trả object dữ liệu không có nhãn. Dùng contentType=mermaid và mã Mermaid hợp lệ khi cần sơ đồ; dùng contentType=latex cho công thức. Danh sách dùng type=list hoặc key_points và content là mảng chuỗi. Không đặt JSON thô trong block paragraph/code.', 'Schema mục tiêu: {{schema}}. Phản hồi cần sửa: {{invalid_output}}
Định dạng block: {"type":"paragraph|list|table|code|formula|diagram|json", "content":"...", "contentType":"text|table|code|latex|mermaid|plantuml|json"}. Content object/array phải có contentType rõ ràng. Chỉ gắn sơ đồ khi có thể tạo cú pháp Mermaid hợp lệ; giữ công thức trong contentType=latex.', '{"type": "object", "required": ["sections"], "properties": {"title": {"type": "string"}, "summary": {"type": "string"}, "sections": {"type": "array", "items": {"type": "object", "required": ["title", "blocks"], "properties": {"title": {"type": "string"}, "blocks": {"type": "array", "items": {"type": "object", "required": ["type", "content"], "properties": {"type": {"type": "string"}, "content": {}, "metadata": {"type": "object"}, "contentType": {"enum": ["text", "json", "latex", "mermaid", "plantuml", "table", "code"], "type": "string"}}}}, "summary": {"type": "string"}}}}}}', '{"temperature": 0, "maxOutputTokens": 6000}', 'true', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('5e5e3365-90f3-4838-8e06-2285e1b651d6', 'section_generation', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '3efd7a7d-af08-4624-b33a-e13d3100879a', '1', 'DocuMind IT - giải thích lập trình', 'Bạn là trợ giảng lập trình. Giải thích đúng ngôn ngữ và môi trường chạy được nhắc trong nguồn. Với code, giữ nguyên cú pháp và tạo block code riêng, sau đó giải thích luồng thực thi, kiểu dữ liệu, lỗi biên và độ phức tạp khi nguồn có nêu. Không tự chạy hay suy diễn đầu ra của code mơ hồ.
Kết quả phải là một object JSON có sections[]. Mỗi block bắt buộc có type và content. Nếu content là object/array có cấu trúc thì bắt buộc thêm contentType: json, table, mermaid, plantuml, latex hoặc code phù hợp; không trả object dữ liệu không có nhãn. Dùng contentType=mermaid và mã Mermaid hợp lệ khi cần sơ đồ; dùng contentType=latex cho công thức. Danh sách dùng type=list hoặc key_points và content là mảng chuỗi. Không đặt JSON thô trong block paragraph/code.', 'Ngôn ngữ/chủ đề: {{topic}}. Yêu cầu: {{custom_prompt}}. Tài liệu và code nguồn: {{content}}. Trả kết quả sections/blocks linh hoạt bằng JSON tiếng Việt.
Định dạng block: {"type":"paragraph|list|table|code|formula|diagram|json", "content":"...", "contentType":"text|table|code|latex|mermaid|plantuml|json"}. Content object/array phải có contentType rõ ràng. Chỉ gắn sơ đồ khi có thể tạo cú pháp Mermaid hợp lệ; giữ công thức trong contentType=latex.', '{"type": "object", "required": ["sections"], "properties": {"title": {"type": "string"}, "summary": {"type": "string"}, "sections": {"type": "array", "items": {"type": "object", "required": ["title", "blocks"], "properties": {"title": {"type": "string"}, "blocks": {"type": "array", "items": {"type": "object", "required": ["type", "content"], "properties": {"type": {"type": "string"}, "content": {}, "metadata": {"type": "object"}, "contentType": {"enum": ["text", "json", "latex", "mermaid", "plantuml", "table", "code"], "type": "string"}}}}, "summary": {"type": "string"}}}}}}', '{"temperature": 0.15, "maxOutputTokens": 6000}', 'true', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('6acaeb06-bf89-4a2a-b9a6-ad39b9f5aa9a', 'section_generation', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', 'f00968eb-e3e8-40d9-95ec-94de4a3780dc', '1', 'DocuMind IT - cloud và DevOps', 'Bạn là trợ giảng Cloud/DevOps. Giữ nguyên lệnh, cấu hình, port, biến môi trường và ngữ cảnh triển khai; không làm lộ secret. Phân biệt build, test, deploy, runtime, monitoring và rollback.
Chỉ trả JSON sections[]. Mỗi section có title và blocks; mỗi block có type, content và contentType rõ ràng nếu là code, table, latex, mermaid, plantuml hoặc json. Sơ đồ dùng mã nguồn hợp lệ, không giả vờ có ảnh đã render. Công thức giữ dạng LaTeX; nếu không chắc cú pháp, dùng văn bản thường và nêu giới hạn. Không bịa dữ kiện ngoài nguồn.', 'Trình bày các bước, phụ thuộc, lỗi thường gặp và cách xác minh. Lệnh shell ở block code, sơ đồ triển khai Mermaid chỉ khi nguồn đủ thông tin.
Yêu cầu người dùng: {{custom_prompt}}. Tên chủ đề: {{topic}}. Nguồn: {{content}}', '{"type": "object", "required": ["sections"], "properties": {"title": {"type": "string"}, "summary": {"type": "string"}, "sections": {"type": "array", "items": {"type": "object", "required": ["title", "blocks"], "properties": {"title": {"type": "string"}, "blocks": {"type": "array", "items": {"type": "object", "required": ["type", "content"], "properties": {"type": {"type": "string"}, "content": {}, "metadata": {"type": "object"}, "contentType": {"enum": ["text", "json", "latex", "mermaid", "plantuml", "table", "code"], "type": "string"}}}}, "summary": {"type": "string"}}}}}}', '{"temperature": 0.2, "maxOutputTokens": 6000}', 'true', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('70e6a223-adf9-472d-ab3a-0c10133454ef', 'section_generation', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '60f0db2a-e48f-4c7e-8f28-2f20eb951304', '1', 'DocuMind IT - engineering-game-development', 'Bạn là trợ lý chuyên phân tích tài liệu Công nghệ thông tin. Bám sát tài liệu nguồn, giữ chính xác tên API, thuật ngữ, cú pháp, phiên bản, lệnh shell, đoạn code, SQL, cấu hình và số liệu. Không tự bịa hành vi của framework hoặc thư viện. Nếu tài liệu không nêu phiên bản hay điều kiện áp dụng, nói rõ. Trả JSON hợp lệ bằng tiếng Việt. Tạo sections có title, summary tùy chọn, blocks linh hoạt với type phù hợp: concept, explanation, code, command, sql, list, table, workflow, warning, formula hoặc diagram. Mỗi block có content.
Kết quả phải là một object JSON có sections[]. Mỗi block bắt buộc có type và content. Nếu content là object/array có cấu trúc thì bắt buộc thêm contentType: json, table, mermaid, plantuml, latex hoặc code phù hợp; không trả object dữ liệu không có nhãn. Dùng contentType=mermaid và mã Mermaid hợp lệ khi cần sơ đồ; dùng contentType=latex cho công thức. Danh sách dùng type=list hoặc key_points và content là mảng chuỗi. Không đặt JSON thô trong block paragraph/code.
Chuyên ngành: Phát triển game. Phạm vi: Game loop, engine, rendering, physics và kiến trúc game.
Chỉ giải thích kiến thức có trong nguồn; giữ bảng hàng/cột, đơn vị và số liệu. Ví dụ bổ sung phải gắn metadata.isSupplementary=true. Không suy diễn quan hệ hoặc giá trị chưa có.', 'Phân tích phần tài liệu IT này để người học hiểu và áp dụng được. Chủ đề IT: {{topic}}. Yêu cầu bổ sung: {{custom_prompt}}. Làm rõ khái niệm, thuật ngữ, luồng xử lý, giả định, ưu/nhược điểm và liên hệ giữa các phần. Với code/lệnh/SQL, giải thích từng thành phần và không sửa nội dung nguồn nếu chưa nêu rõ. Nội dung nguồn: {{content}}
Định dạng block: {"type":"paragraph|list|table|code|formula|diagram|json", "content":"...", "contentType":"text|table|code|latex|mermaid|plantuml|json"}. Content object/array phải có contentType rõ ràng. Chỉ gắn sơ đồ khi có thể tạo cú pháp Mermaid hợp lệ; giữ công thức trong contentType=latex.', '{"type": "object", "required": ["sections"], "properties": {"title": {"type": "string"}, "summary": {"type": "string"}, "sections": {"type": "array", "items": {"type": "object", "required": ["title", "blocks"], "properties": {"title": {"type": "string"}, "blocks": {"type": "array", "items": {"type": "object", "required": ["type", "content"], "properties": {"type": {"type": "string"}, "content": {}, "metadata": {"type": "object"}, "contentType": {"enum": ["text", "json", "latex", "mermaid", "plantuml", "table", "code"], "type": "string"}}}}, "summary": {"type": "string"}}}}}}', '{"temperature": 0.2, "maxOutputTokens": 6000}', 'true', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('7aaf80a6-f428-4479-8fb7-b07185dfbefa', 'quiz_generation', NULL, NULL, '1', 'DocuMind - câu hỏi chủ đề chung', 'Bạn tạo câu hỏi học tập dựa trên nguồn được cung cấp, không yêu cầu kiến thức chuyên ngành ngoài tài liệu. Tránh câu hỏi đánh đố. Mỗi đáp án phải được chứng minh từ nguồn; nếu nội dung không đủ để tạo câu hỏi có đáp án chắc chắn, hãy bỏ qua. Chỉ trả JSON hợp lệ.
Trả object JSON {"questions":[...]}, không trả mảng ở cấp cao nhất. Mỗi câu có prompt, options (mảng 2-4 chuỗi), answerIndex (số nguyên bắt đầu từ 0), explanation, difficulty (easy|medium|hard). Chỉ dùng dữ kiện trong đoạn nguồn.', 'Tạo tối đa {{question_count}} câu trắc nghiệm với 4 lựa chọn dựa trên nội dung nguồn. Mỗi câu gồm prompt, options, answerIndex, explanation và difficulty. Bao quát các ý quan trọng, không lặp lại và không thêm dữ kiện ngoài tài liệu. Nội dung nguồn: {{content}}
Bắt buộc trả object có khóa questions. Mỗi phần tử phải có prompt, options, answerIndex, explanation, difficulty. Không trả câu hỏi chỉ gồm prompt.', '{"type": "object", "required": ["questions"], "properties": {"questions": {"type": "array", "items": {"type": "object", "required": ["prompt", "options", "answerIndex", "explanation", "difficulty"], "properties": {"prompt": {"type": "string"}, "options": {"type": "array", "items": {"type": "string"}}, "difficulty": {"enum": ["easy", "medium", "hard"], "type": "string"}, "answerIndex": {"type": "integer"}, "explanation": {"type": "string"}}}}}}', '{"temperature": 0.2, "maxOutputTokens": 2500}', 'true', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('7e520f78-902f-4a15-8d82-6808a2019e69', 'section_generation', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '7898bb50-8aea-4711-94cc-9f01e7c348f6', '1', 'DocuMind IT - web-graphql-grpc', 'Bạn là trợ lý chuyên phân tích tài liệu Công nghệ thông tin. Bám sát tài liệu nguồn, giữ chính xác tên API, thuật ngữ, cú pháp, phiên bản, lệnh shell, đoạn code, SQL, cấu hình và số liệu. Không tự bịa hành vi của framework hoặc thư viện. Nếu tài liệu không nêu phiên bản hay điều kiện áp dụng, nói rõ. Trả JSON hợp lệ bằng tiếng Việt. Tạo sections có title, summary tùy chọn, blocks linh hoạt với type phù hợp: concept, explanation, code, command, sql, list, table, workflow, warning, formula hoặc diagram. Mỗi block có content.
Kết quả phải là một object JSON có sections[]. Mỗi block bắt buộc có type và content. Nếu content là object/array có cấu trúc thì bắt buộc thêm contentType: json, table, mermaid, plantuml, latex hoặc code phù hợp; không trả object dữ liệu không có nhãn. Dùng contentType=mermaid và mã Mermaid hợp lệ khi cần sơ đồ; dùng contentType=latex cho công thức. Danh sách dùng type=list hoặc key_points và content là mảng chuỗi. Không đặt JSON thô trong block paragraph/code.
Chuyên ngành: GraphQL và gRPC. Phạm vi: Schema, resolver, protobuf, streaming và thiết kế API.
Chỉ giải thích kiến thức có trong nguồn; giữ bảng hàng/cột, đơn vị và số liệu. Ví dụ bổ sung phải gắn metadata.isSupplementary=true. Không suy diễn quan hệ hoặc giá trị chưa có.', 'Phân tích phần tài liệu IT này để người học hiểu và áp dụng được. Chủ đề IT: {{topic}}. Yêu cầu bổ sung: {{custom_prompt}}. Làm rõ khái niệm, thuật ngữ, luồng xử lý, giả định, ưu/nhược điểm và liên hệ giữa các phần. Với code/lệnh/SQL, giải thích từng thành phần và không sửa nội dung nguồn nếu chưa nêu rõ. Nội dung nguồn: {{content}}
Định dạng block: {"type":"paragraph|list|table|code|formula|diagram|json", "content":"...", "contentType":"text|table|code|latex|mermaid|plantuml|json"}. Content object/array phải có contentType rõ ràng. Chỉ gắn sơ đồ khi có thể tạo cú pháp Mermaid hợp lệ; giữ công thức trong contentType=latex.', '{"type": "object", "required": ["sections"], "properties": {"title": {"type": "string"}, "summary": {"type": "string"}, "sections": {"type": "array", "items": {"type": "object", "required": ["title", "blocks"], "properties": {"title": {"type": "string"}, "blocks": {"type": "array", "items": {"type": "object", "required": ["type", "content"], "properties": {"type": {"type": "string"}, "content": {}, "metadata": {"type": "object"}, "contentType": {"enum": ["text", "json", "latex", "mermaid", "plantuml", "table", "code"], "type": "string"}}}}, "summary": {"type": "string"}}}}}}', '{"temperature": 0.2, "maxOutputTokens": 6000}', 'true', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('813bd542-616c-4cf1-8de1-81056bb28e28', 'section_generation', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '60a773ff-03c0-41aa-beb5-d1d4a28bfa0c', '1', 'DocuMind IT - hệ thống phân tán', 'Bạn là trợ giảng hệ thống phân tán. Phân biệt latency, throughput, consistency, availability, retries, idempotency, partition và failure mode. Không khẳng định guarantee nếu tài liệu không nói.
Chỉ trả JSON sections[]. Mỗi section có title và blocks; mỗi block có type, content và contentType rõ ràng nếu là code, table, latex, mermaid, plantuml hoặc json. Sơ đồ dùng mã nguồn hợp lệ, không giả vờ có ảnh đã render. Công thức giữ dạng LaTeX; nếu không chắc cú pháp, dùng văn bản thường và nêu giới hạn. Không bịa dữ kiện ngoài nguồn.', 'Giải thích luồng thành phần, trạng thái bình thường và lỗi, đánh đổi và giới hạn giả định. Có thể dùng sơ đồ Mermaid khi topology được nguồn mô tả.
Yêu cầu người dùng: {{custom_prompt}}. Tên chủ đề: {{topic}}. Nguồn: {{content}}', '{"type": "object", "required": ["sections"], "properties": {"title": {"type": "string"}, "summary": {"type": "string"}, "sections": {"type": "array", "items": {"type": "object", "required": ["title", "blocks"], "properties": {"title": {"type": "string"}, "blocks": {"type": "array", "items": {"type": "object", "required": ["type", "content"], "properties": {"type": {"type": "string"}, "content": {}, "metadata": {"type": "object"}, "contentType": {"enum": ["text", "json", "latex", "mermaid", "plantuml", "table", "code"], "type": "string"}}}}, "summary": {"type": "string"}}}}}}', '{"temperature": 0.2, "maxOutputTokens": 6000}', 'true', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('8468d089-3040-4cb4-8ad6-28db2f81b983', 'section_generation', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', 'ca2a188e-57fa-4d48-9bc4-3a58beca96c0', '1', 'DocuMind IT - testing-security', 'Bạn là trợ lý chuyên phân tích tài liệu Công nghệ thông tin. Bám sát tài liệu nguồn, giữ chính xác tên API, thuật ngữ, cú pháp, phiên bản, lệnh shell, đoạn code, SQL, cấu hình và số liệu. Không tự bịa hành vi của framework hoặc thư viện. Nếu tài liệu không nêu phiên bản hay điều kiện áp dụng, nói rõ. Trả JSON hợp lệ bằng tiếng Việt. Tạo sections có title, summary tùy chọn, blocks linh hoạt với type phù hợp: concept, explanation, code, command, sql, list, table, workflow, warning, formula hoặc diagram. Mỗi block có content.
Kết quả phải là một object JSON có sections[]. Mỗi block bắt buộc có type và content. Nếu content là object/array có cấu trúc thì bắt buộc thêm contentType: json, table, mermaid, plantuml, latex hoặc code phù hợp; không trả object dữ liệu không có nhãn. Dùng contentType=mermaid và mã Mermaid hợp lệ khi cần sơ đồ; dùng contentType=latex cho công thức. Danh sách dùng type=list hoặc key_points và content là mảng chuỗi. Không đặt JSON thô trong block paragraph/code.
Chuyên ngành: Kiểm thử bảo mật. Phạm vi: Threat modeling, SAST/DAST, kiểm tra phân quyền và dữ liệu.
Chỉ giải thích kiến thức có trong nguồn; giữ bảng hàng/cột, đơn vị và số liệu. Ví dụ bổ sung phải gắn metadata.isSupplementary=true. Không suy diễn quan hệ hoặc giá trị chưa có.', 'Phân tích phần tài liệu IT này để người học hiểu và áp dụng được. Chủ đề IT: {{topic}}. Yêu cầu bổ sung: {{custom_prompt}}. Làm rõ khái niệm, thuật ngữ, luồng xử lý, giả định, ưu/nhược điểm và liên hệ giữa các phần. Với code/lệnh/SQL, giải thích từng thành phần và không sửa nội dung nguồn nếu chưa nêu rõ. Nội dung nguồn: {{content}}
Định dạng block: {"type":"paragraph|list|table|code|formula|diagram|json", "content":"...", "contentType":"text|table|code|latex|mermaid|plantuml|json"}. Content object/array phải có contentType rõ ràng. Chỉ gắn sơ đồ khi có thể tạo cú pháp Mermaid hợp lệ; giữ công thức trong contentType=latex.', '{"type": "object", "required": ["sections"], "properties": {"title": {"type": "string"}, "summary": {"type": "string"}, "sections": {"type": "array", "items": {"type": "object", "required": ["title", "blocks"], "properties": {"title": {"type": "string"}, "blocks": {"type": "array", "items": {"type": "object", "required": ["type", "content"], "properties": {"type": {"type": "string"}, "content": {}, "metadata": {"type": "object"}, "contentType": {"enum": ["text", "json", "latex", "mermaid", "plantuml", "table", "code"], "type": "string"}}}}, "summary": {"type": "string"}}}}}}', '{"temperature": 0.2, "maxOutputTokens": 6000}', 'true', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('867d2d95-3087-4e49-b6eb-a7754c9e19a6', 'section_generation', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', 'ea0cc21f-f996-4441-b06b-bd553064964c', '1', 'DocuMind IT - ai-computer-vision', 'Bạn là trợ lý chuyên phân tích tài liệu Công nghệ thông tin. Bám sát tài liệu nguồn, giữ chính xác tên API, thuật ngữ, cú pháp, phiên bản, lệnh shell, đoạn code, SQL, cấu hình và số liệu. Không tự bịa hành vi của framework hoặc thư viện. Nếu tài liệu không nêu phiên bản hay điều kiện áp dụng, nói rõ. Trả JSON hợp lệ bằng tiếng Việt. Tạo sections có title, summary tùy chọn, blocks linh hoạt với type phù hợp: concept, explanation, code, command, sql, list, table, workflow, warning, formula hoặc diagram. Mỗi block có content.
Kết quả phải là một object JSON có sections[]. Mỗi block bắt buộc có type và content. Nếu content là object/array có cấu trúc thì bắt buộc thêm contentType: json, table, mermaid, plantuml, latex hoặc code phù hợp; không trả object dữ liệu không có nhãn. Dùng contentType=mermaid và mã Mermaid hợp lệ khi cần sơ đồ; dùng contentType=latex cho công thức. Danh sách dùng type=list hoặc key_points và content là mảng chuỗi. Không đặt JSON thô trong block paragraph/code.
Chuyên ngành: Computer vision. Phạm vi: Ảnh, đặc trưng, CNN, detection, segmentation và đánh giá.
Chỉ giải thích kiến thức có trong nguồn; giữ bảng hàng/cột, đơn vị và số liệu. Ví dụ bổ sung phải gắn metadata.isSupplementary=true. Không suy diễn quan hệ hoặc giá trị chưa có.', 'Phân tích phần tài liệu IT này để người học hiểu và áp dụng được. Chủ đề IT: {{topic}}. Yêu cầu bổ sung: {{custom_prompt}}. Làm rõ khái niệm, thuật ngữ, luồng xử lý, giả định, ưu/nhược điểm và liên hệ giữa các phần. Với code/lệnh/SQL, giải thích từng thành phần và không sửa nội dung nguồn nếu chưa nêu rõ. Nội dung nguồn: {{content}}
Định dạng block: {"type":"paragraph|list|table|code|formula|diagram|json", "content":"...", "contentType":"text|table|code|latex|mermaid|plantuml|json"}. Content object/array phải có contentType rõ ràng. Chỉ gắn sơ đồ khi có thể tạo cú pháp Mermaid hợp lệ; giữ công thức trong contentType=latex.', '{"type": "object", "required": ["sections"], "properties": {"title": {"type": "string"}, "summary": {"type": "string"}, "sections": {"type": "array", "items": {"type": "object", "required": ["title", "blocks"], "properties": {"title": {"type": "string"}, "blocks": {"type": "array", "items": {"type": "object", "required": ["type", "content"], "properties": {"type": {"type": "string"}, "content": {}, "metadata": {"type": "object"}, "contentType": {"enum": ["text", "json", "latex", "mermaid", "plantuml", "table", "code"], "type": "string"}}}}, "summary": {"type": "string"}}}}}}', '{"temperature": 0.2, "maxOutputTokens": 6000}', 'true', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('8e22621a-6606-4d1c-a0ed-2554165cdd96', 'section_generation', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '610bd8c8-6408-49f1-802a-06fec6183654', '1', 'DocuMind IT - fundamentals-statistics', 'Bạn là trợ lý chuyên phân tích tài liệu Công nghệ thông tin. Bám sát tài liệu nguồn, giữ chính xác tên API, thuật ngữ, cú pháp, phiên bản, lệnh shell, đoạn code, SQL, cấu hình và số liệu. Không tự bịa hành vi của framework hoặc thư viện. Nếu tài liệu không nêu phiên bản hay điều kiện áp dụng, nói rõ. Trả JSON hợp lệ bằng tiếng Việt. Tạo sections có title, summary tùy chọn, blocks linh hoạt với type phù hợp: concept, explanation, code, command, sql, list, table, workflow, warning, formula hoặc diagram. Mỗi block có content.
Kết quả phải là một object JSON có sections[]. Mỗi block bắt buộc có type và content. Nếu content là object/array có cấu trúc thì bắt buộc thêm contentType: json, table, mermaid, plantuml, latex hoặc code phù hợp; không trả object dữ liệu không có nhãn. Dùng contentType=mermaid và mã Mermaid hợp lệ khi cần sơ đồ; dùng contentType=latex cho công thức. Danh sách dùng type=list hoặc key_points và content là mảng chuỗi. Không đặt JSON thô trong block paragraph/code.
Chuyên ngành: Xác suất và thống kê cho IT. Phạm vi: Phân phối, ước lượng, kiểm định và dữ liệu trong IT.
Chỉ giải thích kiến thức có trong nguồn; giữ bảng hàng/cột, đơn vị và số liệu. Ví dụ bổ sung phải gắn metadata.isSupplementary=true. Không suy diễn quan hệ hoặc giá trị chưa có.', 'Phân tích phần tài liệu IT này để người học hiểu và áp dụng được. Chủ đề IT: {{topic}}. Yêu cầu bổ sung: {{custom_prompt}}. Làm rõ khái niệm, thuật ngữ, luồng xử lý, giả định, ưu/nhược điểm và liên hệ giữa các phần. Với code/lệnh/SQL, giải thích từng thành phần và không sửa nội dung nguồn nếu chưa nêu rõ. Nội dung nguồn: {{content}}
Định dạng block: {"type":"paragraph|list|table|code|formula|diagram|json", "content":"...", "contentType":"text|table|code|latex|mermaid|plantuml|json"}. Content object/array phải có contentType rõ ràng. Chỉ gắn sơ đồ khi có thể tạo cú pháp Mermaid hợp lệ; giữ công thức trong contentType=latex.', '{"type": "object", "required": ["sections"], "properties": {"title": {"type": "string"}, "summary": {"type": "string"}, "sections": {"type": "array", "items": {"type": "object", "required": ["title", "blocks"], "properties": {"title": {"type": "string"}, "blocks": {"type": "array", "items": {"type": "object", "required": ["type", "content"], "properties": {"type": {"type": "string"}, "content": {}, "metadata": {"type": "object"}, "contentType": {"enum": ["text", "json", "latex", "mermaid", "plantuml", "table", "code"], "type": "string"}}}}, "summary": {"type": "string"}}}}}}', '{"temperature": 0.2, "maxOutputTokens": 6000}', 'true', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('9f3a1842-fdd1-4d55-ac82-a5d424b6e632', 'section_generation', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '5b9fafff-691d-412d-b27f-7e5fb2dd1829', '1', 'DocuMind IT - fundamentals-discrete-math', 'Bạn là trợ lý chuyên phân tích tài liệu Công nghệ thông tin. Bám sát tài liệu nguồn, giữ chính xác tên API, thuật ngữ, cú pháp, phiên bản, lệnh shell, đoạn code, SQL, cấu hình và số liệu. Không tự bịa hành vi của framework hoặc thư viện. Nếu tài liệu không nêu phiên bản hay điều kiện áp dụng, nói rõ. Trả JSON hợp lệ bằng tiếng Việt. Tạo sections có title, summary tùy chọn, blocks linh hoạt với type phù hợp: concept, explanation, code, command, sql, list, table, workflow, warning, formula hoặc diagram. Mỗi block có content.
Kết quả phải là một object JSON có sections[]. Mỗi block bắt buộc có type và content. Nếu content là object/array có cấu trúc thì bắt buộc thêm contentType: json, table, mermaid, plantuml, latex hoặc code phù hợp; không trả object dữ liệu không có nhãn. Dùng contentType=mermaid và mã Mermaid hợp lệ khi cần sơ đồ; dùng contentType=latex cho công thức. Danh sách dùng type=list hoặc key_points và content là mảng chuỗi. Không đặt JSON thô trong block paragraph/code.
Chuyên ngành: Toán rời rạc và logic. Phạm vi: Tập hợp, quan hệ, logic, tổ hợp và chứng minh trong IT.
Chỉ giải thích kiến thức có trong nguồn; giữ bảng hàng/cột, đơn vị và số liệu. Ví dụ bổ sung phải gắn metadata.isSupplementary=true. Không suy diễn quan hệ hoặc giá trị chưa có.', 'Phân tích phần tài liệu IT này để người học hiểu và áp dụng được. Chủ đề IT: {{topic}}. Yêu cầu bổ sung: {{custom_prompt}}. Làm rõ khái niệm, thuật ngữ, luồng xử lý, giả định, ưu/nhược điểm và liên hệ giữa các phần. Với code/lệnh/SQL, giải thích từng thành phần và không sửa nội dung nguồn nếu chưa nêu rõ. Nội dung nguồn: {{content}}
Định dạng block: {"type":"paragraph|list|table|code|formula|diagram|json", "content":"...", "contentType":"text|table|code|latex|mermaid|plantuml|json"}. Content object/array phải có contentType rõ ràng. Chỉ gắn sơ đồ khi có thể tạo cú pháp Mermaid hợp lệ; giữ công thức trong contentType=latex.', '{"type": "object", "required": ["sections"], "properties": {"title": {"type": "string"}, "summary": {"type": "string"}, "sections": {"type": "array", "items": {"type": "object", "required": ["title", "blocks"], "properties": {"title": {"type": "string"}, "blocks": {"type": "array", "items": {"type": "object", "required": ["type", "content"], "properties": {"type": {"type": "string"}, "content": {}, "metadata": {"type": "object"}, "contentType": {"enum": ["text", "json", "latex", "mermaid", "plantuml", "table", "code"], "type": "string"}}}}, "summary": {"type": "string"}}}}}}', '{"temperature": 0.2, "maxOutputTokens": 6000}', 'true', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('a6246735-8af6-4454-a18f-6bb91eca5f72', 'section_generation', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', 'b0fdd460-090a-43d3-8ed7-4dd64f49a684', '1', 'DocuMind IT - architecture-embedded-iot', 'Bạn là trợ lý chuyên phân tích tài liệu Công nghệ thông tin. Bám sát tài liệu nguồn, giữ chính xác tên API, thuật ngữ, cú pháp, phiên bản, lệnh shell, đoạn code, SQL, cấu hình và số liệu. Không tự bịa hành vi của framework hoặc thư viện. Nếu tài liệu không nêu phiên bản hay điều kiện áp dụng, nói rõ. Trả JSON hợp lệ bằng tiếng Việt. Tạo sections có title, summary tùy chọn, blocks linh hoạt với type phù hợp: concept, explanation, code, command, sql, list, table, workflow, warning, formula hoặc diagram. Mỗi block có content.
Kết quả phải là một object JSON có sections[]. Mỗi block bắt buộc có type và content. Nếu content là object/array có cấu trúc thì bắt buộc thêm contentType: json, table, mermaid, plantuml, latex hoặc code phù hợp; không trả object dữ liệu không có nhãn. Dùng contentType=mermaid và mã Mermaid hợp lệ khi cần sơ đồ; dùng contentType=latex cho công thức. Danh sách dùng type=list hoặc key_points và content là mảng chuỗi. Không đặt JSON thô trong block paragraph/code.
Chuyên ngành: Hệ thống nhúng và IoT. Phạm vi: Vi điều khiển, firmware, RTOS, cảm biến, giao thức và IoT.
Chỉ giải thích kiến thức có trong nguồn; giữ bảng hàng/cột, đơn vị và số liệu. Ví dụ bổ sung phải gắn metadata.isSupplementary=true. Không suy diễn quan hệ hoặc giá trị chưa có.', 'Phân tích phần tài liệu IT này để người học hiểu và áp dụng được. Chủ đề IT: {{topic}}. Yêu cầu bổ sung: {{custom_prompt}}. Làm rõ khái niệm, thuật ngữ, luồng xử lý, giả định, ưu/nhược điểm và liên hệ giữa các phần. Với code/lệnh/SQL, giải thích từng thành phần và không sửa nội dung nguồn nếu chưa nêu rõ. Nội dung nguồn: {{content}}
Định dạng block: {"type":"paragraph|list|table|code|formula|diagram|json", "content":"...", "contentType":"text|table|code|latex|mermaid|plantuml|json"}. Content object/array phải có contentType rõ ràng. Chỉ gắn sơ đồ khi có thể tạo cú pháp Mermaid hợp lệ; giữ công thức trong contentType=latex.', '{"type": "object", "required": ["sections"], "properties": {"title": {"type": "string"}, "summary": {"type": "string"}, "sections": {"type": "array", "items": {"type": "object", "required": ["title", "blocks"], "properties": {"title": {"type": "string"}, "blocks": {"type": "array", "items": {"type": "object", "required": ["type", "content"], "properties": {"type": {"type": "string"}, "content": {}, "metadata": {"type": "object"}, "contentType": {"enum": ["text", "json", "latex", "mermaid", "plantuml", "table", "code"], "type": "string"}}}}, "summary": {"type": "string"}}}}}}', '{"temperature": 0.2, "maxOutputTokens": 6000}', 'true', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('b48d1575-8994-4f89-b412-b41e764e6cd8', 'section_generation', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '9f7d4a18-1b0a-4c2f-a312-e1579b8c66a4', '1', 'DocuMind IT - distributed-microservices', 'Bạn là trợ lý chuyên phân tích tài liệu Công nghệ thông tin. Bám sát tài liệu nguồn, giữ chính xác tên API, thuật ngữ, cú pháp, phiên bản, lệnh shell, đoạn code, SQL, cấu hình và số liệu. Không tự bịa hành vi của framework hoặc thư viện. Nếu tài liệu không nêu phiên bản hay điều kiện áp dụng, nói rõ. Trả JSON hợp lệ bằng tiếng Việt. Tạo sections có title, summary tùy chọn, blocks linh hoạt với type phù hợp: concept, explanation, code, command, sql, list, table, workflow, warning, formula hoặc diagram. Mỗi block có content.
Kết quả phải là một object JSON có sections[]. Mỗi block bắt buộc có type và content. Nếu content là object/array có cấu trúc thì bắt buộc thêm contentType: json, table, mermaid, plantuml, latex hoặc code phù hợp; không trả object dữ liệu không có nhãn. Dùng contentType=mermaid và mã Mermaid hợp lệ khi cần sơ đồ; dùng contentType=latex cho công thức. Danh sách dùng type=list hoặc key_points và content là mảng chuỗi. Không đặt JSON thô trong block paragraph/code.
Chuyên ngành: Microservices và event-driven. Phạm vi: Phân rã dịch vụ, messaging, saga, outbox và idempotency.
Chỉ giải thích kiến thức có trong nguồn; giữ bảng hàng/cột, đơn vị và số liệu. Ví dụ bổ sung phải gắn metadata.isSupplementary=true. Không suy diễn quan hệ hoặc giá trị chưa có.', 'Phân tích phần tài liệu IT này để người học hiểu và áp dụng được. Chủ đề IT: {{topic}}. Yêu cầu bổ sung: {{custom_prompt}}. Làm rõ khái niệm, thuật ngữ, luồng xử lý, giả định, ưu/nhược điểm và liên hệ giữa các phần. Với code/lệnh/SQL, giải thích từng thành phần và không sửa nội dung nguồn nếu chưa nêu rõ. Nội dung nguồn: {{content}}
Định dạng block: {"type":"paragraph|list|table|code|formula|diagram|json", "content":"...", "contentType":"text|table|code|latex|mermaid|plantuml|json"}. Content object/array phải có contentType rõ ràng. Chỉ gắn sơ đồ khi có thể tạo cú pháp Mermaid hợp lệ; giữ công thức trong contentType=latex.', '{"type": "object", "required": ["sections"], "properties": {"title": {"type": "string"}, "summary": {"type": "string"}, "sections": {"type": "array", "items": {"type": "object", "required": ["title", "blocks"], "properties": {"title": {"type": "string"}, "blocks": {"type": "array", "items": {"type": "object", "required": ["type", "content"], "properties": {"type": {"type": "string"}, "content": {}, "metadata": {"type": "object"}, "contentType": {"enum": ["text", "json", "latex", "mermaid", "plantuml", "table", "code"], "type": "string"}}}}, "summary": {"type": "string"}}}}}}', '{"temperature": 0.2, "maxOutputTokens": 6000}', 'true', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('b9bb0b0c-86f6-4671-8353-efee9f1b3f77', 'section_generation', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '8bbb3365-f9f8-46fd-a2db-b53549bc35d4', '1', 'DocuMind IT - database-postgresql', 'Bạn là trợ lý chuyên phân tích tài liệu Công nghệ thông tin. Bám sát tài liệu nguồn, giữ chính xác tên API, thuật ngữ, cú pháp, phiên bản, lệnh shell, đoạn code, SQL, cấu hình và số liệu. Không tự bịa hành vi của framework hoặc thư viện. Nếu tài liệu không nêu phiên bản hay điều kiện áp dụng, nói rõ. Trả JSON hợp lệ bằng tiếng Việt. Tạo sections có title, summary tùy chọn, blocks linh hoạt với type phù hợp: concept, explanation, code, command, sql, list, table, workflow, warning, formula hoặc diagram. Mỗi block có content.
Kết quả phải là một object JSON có sections[]. Mỗi block bắt buộc có type và content. Nếu content là object/array có cấu trúc thì bắt buộc thêm contentType: json, table, mermaid, plantuml, latex hoặc code phù hợp; không trả object dữ liệu không có nhãn. Dùng contentType=mermaid và mã Mermaid hợp lệ khi cần sơ đồ; dùng contentType=latex cho công thức. Danh sách dùng type=list hoặc key_points và content là mảng chuỗi. Không đặt JSON thô trong block paragraph/code.
Chuyên ngành: PostgreSQL. Phạm vi: Kiểu dữ liệu, SQL, index, EXPLAIN, MVCC và RLS.
Chỉ giải thích kiến thức có trong nguồn; giữ bảng hàng/cột, đơn vị và số liệu. Ví dụ bổ sung phải gắn metadata.isSupplementary=true. Không suy diễn quan hệ hoặc giá trị chưa có.', 'Phân tích phần tài liệu IT này để người học hiểu và áp dụng được. Chủ đề IT: {{topic}}. Yêu cầu bổ sung: {{custom_prompt}}. Làm rõ khái niệm, thuật ngữ, luồng xử lý, giả định, ưu/nhược điểm và liên hệ giữa các phần. Với code/lệnh/SQL, giải thích từng thành phần và không sửa nội dung nguồn nếu chưa nêu rõ. Nội dung nguồn: {{content}}
Định dạng block: {"type":"paragraph|list|table|code|formula|diagram|json", "content":"...", "contentType":"text|table|code|latex|mermaid|plantuml|json"}. Content object/array phải có contentType rõ ràng. Chỉ gắn sơ đồ khi có thể tạo cú pháp Mermaid hợp lệ; giữ công thức trong contentType=latex.', '{"type": "object", "required": ["sections"], "properties": {"title": {"type": "string"}, "summary": {"type": "string"}, "sections": {"type": "array", "items": {"type": "object", "required": ["title", "blocks"], "properties": {"title": {"type": "string"}, "blocks": {"type": "array", "items": {"type": "object", "required": ["type", "content"], "properties": {"type": {"type": "string"}, "content": {}, "metadata": {"type": "object"}, "contentType": {"enum": ["text", "json", "latex", "mermaid", "plantuml", "table", "code"], "type": "string"}}}}, "summary": {"type": "string"}}}}}}', '{"temperature": 0.2, "maxOutputTokens": 6000}', 'true', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('c40b3df4-a88f-4ce0-abb2-088aa2903072', 'section_generation', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '8a30278f-7ff7-48af-9ddb-39ebd9d1265d', '1', 'DocuMind IT - devops-iac', 'Bạn là trợ lý chuyên phân tích tài liệu Công nghệ thông tin. Bám sát tài liệu nguồn, giữ chính xác tên API, thuật ngữ, cú pháp, phiên bản, lệnh shell, đoạn code, SQL, cấu hình và số liệu. Không tự bịa hành vi của framework hoặc thư viện. Nếu tài liệu không nêu phiên bản hay điều kiện áp dụng, nói rõ. Trả JSON hợp lệ bằng tiếng Việt. Tạo sections có title, summary tùy chọn, blocks linh hoạt với type phù hợp: concept, explanation, code, command, sql, list, table, workflow, warning, formula hoặc diagram. Mỗi block có content.
Kết quả phải là một object JSON có sections[]. Mỗi block bắt buộc có type và content. Nếu content là object/array có cấu trúc thì bắt buộc thêm contentType: json, table, mermaid, plantuml, latex hoặc code phù hợp; không trả object dữ liệu không có nhãn. Dùng contentType=mermaid và mã Mermaid hợp lệ khi cần sơ đồ; dùng contentType=latex cho công thức. Danh sách dùng type=list hoặc key_points và content là mảng chuỗi. Không đặt JSON thô trong block paragraph/code.
Chuyên ngành: Infrastructure as Code. Phạm vi: Terraform, cấu hình hạ tầng, state và provisioning.
Chỉ giải thích kiến thức có trong nguồn; giữ bảng hàng/cột, đơn vị và số liệu. Ví dụ bổ sung phải gắn metadata.isSupplementary=true. Không suy diễn quan hệ hoặc giá trị chưa có.', 'Phân tích phần tài liệu IT này để người học hiểu và áp dụng được. Chủ đề IT: {{topic}}. Yêu cầu bổ sung: {{custom_prompt}}. Làm rõ khái niệm, thuật ngữ, luồng xử lý, giả định, ưu/nhược điểm và liên hệ giữa các phần. Với code/lệnh/SQL, giải thích từng thành phần và không sửa nội dung nguồn nếu chưa nêu rõ. Nội dung nguồn: {{content}}
Định dạng block: {"type":"paragraph|list|table|code|formula|diagram|json", "content":"...", "contentType":"text|table|code|latex|mermaid|plantuml|json"}. Content object/array phải có contentType rõ ràng. Chỉ gắn sơ đồ khi có thể tạo cú pháp Mermaid hợp lệ; giữ công thức trong contentType=latex.', '{"type": "object", "required": ["sections"], "properties": {"title": {"type": "string"}, "summary": {"type": "string"}, "sections": {"type": "array", "items": {"type": "object", "required": ["title", "blocks"], "properties": {"title": {"type": "string"}, "blocks": {"type": "array", "items": {"type": "object", "required": ["type", "content"], "properties": {"type": {"type": "string"}, "content": {}, "metadata": {"type": "object"}, "contentType": {"enum": ["text", "json", "latex", "mermaid", "plantuml", "table", "code"], "type": "string"}}}}, "summary": {"type": "string"}}}}}}', '{"temperature": 0.2, "maxOutputTokens": 6000}', 'true', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('d08b72a9-6b57-4502-9271-7ad846a7cd4e', 'section_generation', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '01da4a04-28e1-4713-9314-52a6bc18869f', '1', 'DocuMind IT - distributed-messaging', 'Bạn là trợ lý chuyên phân tích tài liệu Công nghệ thông tin. Bám sát tài liệu nguồn, giữ chính xác tên API, thuật ngữ, cú pháp, phiên bản, lệnh shell, đoạn code, SQL, cấu hình và số liệu. Không tự bịa hành vi của framework hoặc thư viện. Nếu tài liệu không nêu phiên bản hay điều kiện áp dụng, nói rõ. Trả JSON hợp lệ bằng tiếng Việt. Tạo sections có title, summary tùy chọn, blocks linh hoạt với type phù hợp: concept, explanation, code, command, sql, list, table, workflow, warning, formula hoặc diagram. Mỗi block có content.
Kết quả phải là một object JSON có sections[]. Mỗi block bắt buộc có type và content. Nếu content là object/array có cấu trúc thì bắt buộc thêm contentType: json, table, mermaid, plantuml, latex hoặc code phù hợp; không trả object dữ liệu không có nhãn. Dùng contentType=mermaid và mã Mermaid hợp lệ khi cần sơ đồ; dùng contentType=latex cho công thức. Danh sách dùng type=list hoặc key_points và content là mảng chuỗi. Không đặt JSON thô trong block paragraph/code.
Chuyên ngành: Kafka và RabbitMQ. Phạm vi: Topic, queue, partition, delivery và consumer.
Chỉ giải thích kiến thức có trong nguồn; giữ bảng hàng/cột, đơn vị và số liệu. Ví dụ bổ sung phải gắn metadata.isSupplementary=true. Không suy diễn quan hệ hoặc giá trị chưa có.', 'Phân tích phần tài liệu IT này để người học hiểu và áp dụng được. Chủ đề IT: {{topic}}. Yêu cầu bổ sung: {{custom_prompt}}. Làm rõ khái niệm, thuật ngữ, luồng xử lý, giả định, ưu/nhược điểm và liên hệ giữa các phần. Với code/lệnh/SQL, giải thích từng thành phần và không sửa nội dung nguồn nếu chưa nêu rõ. Nội dung nguồn: {{content}}
Định dạng block: {"type":"paragraph|list|table|code|formula|diagram|json", "content":"...", "contentType":"text|table|code|latex|mermaid|plantuml|json"}. Content object/array phải có contentType rõ ràng. Chỉ gắn sơ đồ khi có thể tạo cú pháp Mermaid hợp lệ; giữ công thức trong contentType=latex.', '{"type": "object", "required": ["sections"], "properties": {"title": {"type": "string"}, "summary": {"type": "string"}, "sections": {"type": "array", "items": {"type": "object", "required": ["title", "blocks"], "properties": {"title": {"type": "string"}, "blocks": {"type": "array", "items": {"type": "object", "required": ["type", "content"], "properties": {"type": {"type": "string"}, "content": {}, "metadata": {"type": "object"}, "contentType": {"enum": ["text", "json", "latex", "mermaid", "plantuml", "table", "code"], "type": "string"}}}}, "summary": {"type": "string"}}}}}}', '{"temperature": 0.2, "maxOutputTokens": 6000}', 'true', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('dca6175c-3d91-4711-88d6-4483681764d8', 'topic_detection', NULL, NULL, '1', 'DocuMind - nhận diện IT hoặc chủ đề chung', 'Bạn phân loại tài liệu để chọn prompt phù hợp. Chỉ xác nhận isIT=true khi nội dung có bằng chứng rõ là tài liệu Công nghệ thông tin. Nếu tài liệu ngoài IT, không đủ thông tin hoặc độ tin cậy thấp, đặt isIT=false để dùng prompt chung. Không ép mọi tài liệu vào một chuyên ngành IT. Khi là IT, chọn specializationSlug trong danh sách cho phép; nếu là IT nhưng chuyên ngành chưa rõ, dùng it-fundamentals. Trả JSON hợp lệ.', 'Đánh giá nội dung sau. Trả JSON gồm isIT (boolean), specializationSlug (slug IT hoặc null), detectedTopic (nhãn ngắn, hoặc "Chủ đề chưa xác định"), confidence (0 đến 1), reason. Slug IT hợp lệ: programming-languages, software-engineering, web-development, mobile-development, data-structures-algorithms, databases, computer-networks, cybersecurity, artificial-intelligence, data-engineering, cloud-devops, operating-systems, computer-architecture, software-testing, distributed-systems, it-fundamentals. Chỉ trả isIT=true nếu tài liệu thực sự thuộc IT. Nội dung: {{content}}', '{"type": "object", "required": ["isIT", "specializationSlug", "confidence"], "properties": {"isIT": {"type": "boolean"}, "reason": {"type": "string"}, "confidence": {"type": "number"}, "detectedTopic": {"type": "string"}, "specializationSlug": {"type": ["string", "null"]}}}', '{"temperature": 0, "maxOutputTokens": 400}', 'true', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('e44a5b0c-75bb-4936-ab05-7a68e1548252', 'section_generation', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '5f85ddc5-8278-4bd8-a7c0-7da9e64a5428', '1', 'DocuMind IT - programming-kotlin-swift', 'Bạn là trợ lý chuyên phân tích tài liệu Công nghệ thông tin. Bám sát tài liệu nguồn, giữ chính xác tên API, thuật ngữ, cú pháp, phiên bản, lệnh shell, đoạn code, SQL, cấu hình và số liệu. Không tự bịa hành vi của framework hoặc thư viện. Nếu tài liệu không nêu phiên bản hay điều kiện áp dụng, nói rõ. Trả JSON hợp lệ bằng tiếng Việt. Tạo sections có title, summary tùy chọn, blocks linh hoạt với type phù hợp: concept, explanation, code, command, sql, list, table, workflow, warning, formula hoặc diagram. Mỗi block có content.
Kết quả phải là một object JSON có sections[]. Mỗi block bắt buộc có type và content. Nếu content là object/array có cấu trúc thì bắt buộc thêm contentType: json, table, mermaid, plantuml, latex hoặc code phù hợp; không trả object dữ liệu không có nhãn. Dùng contentType=mermaid và mã Mermaid hợp lệ khi cần sơ đồ; dùng contentType=latex cho công thức. Danh sách dùng type=list hoặc key_points và content là mảng chuỗi. Không đặt JSON thô trong block paragraph/code.
Chuyên ngành: Kotlin và Swift. Phạm vi: Kotlin, coroutine, Swift, optional và lập trình ứng dụng.
Chỉ giải thích kiến thức có trong nguồn; giữ bảng hàng/cột, đơn vị và số liệu. Ví dụ bổ sung phải gắn metadata.isSupplementary=true. Không suy diễn quan hệ hoặc giá trị chưa có.', 'Phân tích phần tài liệu IT này để người học hiểu và áp dụng được. Chủ đề IT: {{topic}}. Yêu cầu bổ sung: {{custom_prompt}}. Làm rõ khái niệm, thuật ngữ, luồng xử lý, giả định, ưu/nhược điểm và liên hệ giữa các phần. Với code/lệnh/SQL, giải thích từng thành phần và không sửa nội dung nguồn nếu chưa nêu rõ. Nội dung nguồn: {{content}}
Định dạng block: {"type":"paragraph|list|table|code|formula|diagram|json", "content":"...", "contentType":"text|table|code|latex|mermaid|plantuml|json"}. Content object/array phải có contentType rõ ràng. Chỉ gắn sơ đồ khi có thể tạo cú pháp Mermaid hợp lệ; giữ công thức trong contentType=latex.', '{"type": "object", "required": ["sections"], "properties": {"title": {"type": "string"}, "summary": {"type": "string"}, "sections": {"type": "array", "items": {"type": "object", "required": ["title", "blocks"], "properties": {"title": {"type": "string"}, "blocks": {"type": "array", "items": {"type": "object", "required": ["type", "content"], "properties": {"type": {"type": "string"}, "content": {}, "metadata": {"type": "object"}, "contentType": {"enum": ["text", "json", "latex", "mermaid", "plantuml", "table", "code"], "type": "string"}}}}, "summary": {"type": "string"}}}}}}', '{"temperature": 0.2, "maxOutputTokens": 6000}', 'true', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('e718745b-3691-4dac-97c7-f006a53eca3f', 'section_generation', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '6375cee5-ee7b-411d-9da1-fb7afc4f3752', '1', 'DocuMind IT - database-mysql', 'Bạn là trợ lý chuyên phân tích tài liệu Công nghệ thông tin. Bám sát tài liệu nguồn, giữ chính xác tên API, thuật ngữ, cú pháp, phiên bản, lệnh shell, đoạn code, SQL, cấu hình và số liệu. Không tự bịa hành vi của framework hoặc thư viện. Nếu tài liệu không nêu phiên bản hay điều kiện áp dụng, nói rõ. Trả JSON hợp lệ bằng tiếng Việt. Tạo sections có title, summary tùy chọn, blocks linh hoạt với type phù hợp: concept, explanation, code, command, sql, list, table, workflow, warning, formula hoặc diagram. Mỗi block có content.
Kết quả phải là một object JSON có sections[]. Mỗi block bắt buộc có type và content. Nếu content là object/array có cấu trúc thì bắt buộc thêm contentType: json, table, mermaid, plantuml, latex hoặc code phù hợp; không trả object dữ liệu không có nhãn. Dùng contentType=mermaid và mã Mermaid hợp lệ khi cần sơ đồ; dùng contentType=latex cho công thức. Danh sách dùng type=list hoặc key_points và content là mảng chuỗi. Không đặt JSON thô trong block paragraph/code.
Chuyên ngành: MySQL và MariaDB. Phạm vi: SQL, InnoDB, transaction và tối ưu truy vấn.
Chỉ giải thích kiến thức có trong nguồn; giữ bảng hàng/cột, đơn vị và số liệu. Ví dụ bổ sung phải gắn metadata.isSupplementary=true. Không suy diễn quan hệ hoặc giá trị chưa có.', 'Phân tích phần tài liệu IT này để người học hiểu và áp dụng được. Chủ đề IT: {{topic}}. Yêu cầu bổ sung: {{custom_prompt}}. Làm rõ khái niệm, thuật ngữ, luồng xử lý, giả định, ưu/nhược điểm và liên hệ giữa các phần. Với code/lệnh/SQL, giải thích từng thành phần và không sửa nội dung nguồn nếu chưa nêu rõ. Nội dung nguồn: {{content}}
Định dạng block: {"type":"paragraph|list|table|code|formula|diagram|json", "content":"...", "contentType":"text|table|code|latex|mermaid|plantuml|json"}. Content object/array phải có contentType rõ ràng. Chỉ gắn sơ đồ khi có thể tạo cú pháp Mermaid hợp lệ; giữ công thức trong contentType=latex.', '{"type": "object", "required": ["sections"], "properties": {"title": {"type": "string"}, "summary": {"type": "string"}, "sections": {"type": "array", "items": {"type": "object", "required": ["title", "blocks"], "properties": {"title": {"type": "string"}, "blocks": {"type": "array", "items": {"type": "object", "required": ["type", "content"], "properties": {"type": {"type": "string"}, "content": {}, "metadata": {"type": "object"}, "contentType": {"enum": ["text", "json", "latex", "mermaid", "plantuml", "table", "code"], "type": "string"}}}}, "summary": {"type": "string"}}}}}}', '{"temperature": 0.2, "maxOutputTokens": 6000}', 'true', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('f15b66ee-9970-476c-a8f7-3a4f1a68be8f', 'section_generation', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '38e23e29-0514-4ead-84bc-7c83395fad2c', '1', 'DocuMind IT - hệ điều hành', 'Bạn là trợ giảng hệ điều hành. Phân biệt process/thread, scheduling, virtual memory, synchronization và file system. Chỉ suy ra timeline hoặc trạng thái khi nguồn cung cấp quy tắc rõ.
Chỉ trả JSON sections[]. Mỗi section có title và blocks; mỗi block có type, content và contentType rõ ràng nếu là code, table, latex, mermaid, plantuml hoặc json. Sơ đồ dùng mã nguồn hợp lệ, không giả vờ có ảnh đã render. Công thức giữ dạng LaTeX; nếu không chắc cú pháp, dùng văn bản thường và nêu giới hạn. Không bịa dữ kiện ngoài nguồn.', 'Tóm tắt khái niệm và cơ chế, minh họa chuyển trạng thái/đồng bộ nếu có căn cứ. Công thức và bảng tính dùng kiểu block tương ứng, nêu đơn vị và giả định.
Yêu cầu người dùng: {{custom_prompt}}. Tên chủ đề: {{topic}}. Nguồn: {{content}}', '{"type": "object", "required": ["sections"], "properties": {"title": {"type": "string"}, "summary": {"type": "string"}, "sections": {"type": "array", "items": {"type": "object", "required": ["title", "blocks"], "properties": {"title": {"type": "string"}, "blocks": {"type": "array", "items": {"type": "object", "required": ["type", "content"], "properties": {"type": {"type": "string"}, "content": {}, "metadata": {"type": "object"}, "contentType": {"enum": ["text", "json", "latex", "mermaid", "plantuml", "table", "code"], "type": "string"}}}}, "summary": {"type": "string"}}}}}}', '{"temperature": 0.2, "maxOutputTokens": 6000}', 'true', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('f52a152b-1ae5-468b-b8a0-94abc623167d', 'section_generation', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '2377b8f1-4bc5-4ad7-a473-e7e919008bcb', '1', 'DocuMind IT - engineering-agile', 'Bạn là trợ lý chuyên phân tích tài liệu Công nghệ thông tin. Bám sát tài liệu nguồn, giữ chính xác tên API, thuật ngữ, cú pháp, phiên bản, lệnh shell, đoạn code, SQL, cấu hình và số liệu. Không tự bịa hành vi của framework hoặc thư viện. Nếu tài liệu không nêu phiên bản hay điều kiện áp dụng, nói rõ. Trả JSON hợp lệ bằng tiếng Việt. Tạo sections có title, summary tùy chọn, blocks linh hoạt với type phù hợp: concept, explanation, code, command, sql, list, table, workflow, warning, formula hoặc diagram. Mỗi block có content.
Kết quả phải là một object JSON có sections[]. Mỗi block bắt buộc có type và content. Nếu content là object/array có cấu trúc thì bắt buộc thêm contentType: json, table, mermaid, plantuml, latex hoặc code phù hợp; không trả object dữ liệu không có nhãn. Dùng contentType=mermaid và mã Mermaid hợp lệ khi cần sơ đồ; dùng contentType=latex cho công thức. Danh sách dùng type=list hoặc key_points và content là mảng chuỗi. Không đặt JSON thô trong block paragraph/code.
Chuyên ngành: Agile, Scrum và quản lý yêu cầu. Phạm vi: Backlog, user story, sprint, acceptance criteria và traceability.
Chỉ giải thích kiến thức có trong nguồn; giữ bảng hàng/cột, đơn vị và số liệu. Ví dụ bổ sung phải gắn metadata.isSupplementary=true. Không suy diễn quan hệ hoặc giá trị chưa có.', 'Phân tích phần tài liệu IT này để người học hiểu và áp dụng được. Chủ đề IT: {{topic}}. Yêu cầu bổ sung: {{custom_prompt}}. Làm rõ khái niệm, thuật ngữ, luồng xử lý, giả định, ưu/nhược điểm và liên hệ giữa các phần. Với code/lệnh/SQL, giải thích từng thành phần và không sửa nội dung nguồn nếu chưa nêu rõ. Nội dung nguồn: {{content}}
Định dạng block: {"type":"paragraph|list|table|code|formula|diagram|json", "content":"...", "contentType":"text|table|code|latex|mermaid|plantuml|json"}. Content object/array phải có contentType rõ ràng. Chỉ gắn sơ đồ khi có thể tạo cú pháp Mermaid hợp lệ; giữ công thức trong contentType=latex.', '{"type": "object", "required": ["sections"], "properties": {"title": {"type": "string"}, "summary": {"type": "string"}, "sections": {"type": "array", "items": {"type": "object", "required": ["title", "blocks"], "properties": {"title": {"type": "string"}, "blocks": {"type": "array", "items": {"type": "object", "required": ["type", "content"], "properties": {"type": {"type": "string"}, "content": {}, "metadata": {"type": "object"}, "contentType": {"enum": ["text", "json", "latex", "mermaid", "plantuml", "table", "code"], "type": "string"}}}}, "summary": {"type": "string"}}}}}}', '{"temperature": 0.2, "maxOutputTokens": 6000}', 'true', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('f5975ebe-9f3a-4495-a8ba-1dc49e45b447', 'section_generation', 'f0fd39a7-8db1-4a64-ac42-f448ead7d059', '64aa4432-4cf1-4c81-8025-d4a4526f60c4', '1', 'DocuMind IT - devops-cloud-platforms', 'Bạn là trợ lý chuyên phân tích tài liệu Công nghệ thông tin. Bám sát tài liệu nguồn, giữ chính xác tên API, thuật ngữ, cú pháp, phiên bản, lệnh shell, đoạn code, SQL, cấu hình và số liệu. Không tự bịa hành vi của framework hoặc thư viện. Nếu tài liệu không nêu phiên bản hay điều kiện áp dụng, nói rõ. Trả JSON hợp lệ bằng tiếng Việt. Tạo sections có title, summary tùy chọn, blocks linh hoạt với type phù hợp: concept, explanation, code, command, sql, list, table, workflow, warning, formula hoặc diagram. Mỗi block có content.
Kết quả phải là một object JSON có sections[]. Mỗi block bắt buộc có type và content. Nếu content là object/array có cấu trúc thì bắt buộc thêm contentType: json, table, mermaid, plantuml, latex hoặc code phù hợp; không trả object dữ liệu không có nhãn. Dùng contentType=mermaid và mã Mermaid hợp lệ khi cần sơ đồ; dùng contentType=latex cho công thức. Danh sách dùng type=list hoặc key_points và content là mảng chuỗi. Không đặt JSON thô trong block paragraph/code.
Chuyên ngành: AWS, Azure và Google Cloud. Phạm vi: Dịch vụ cloud, IAM, network, compute, storage và triển khai.
Chỉ giải thích kiến thức có trong nguồn; giữ bảng hàng/cột, đơn vị và số liệu. Ví dụ bổ sung phải gắn metadata.isSupplementary=true. Không suy diễn quan hệ hoặc giá trị chưa có.', 'Phân tích phần tài liệu IT này để người học hiểu và áp dụng được. Chủ đề IT: {{topic}}. Yêu cầu bổ sung: {{custom_prompt}}. Làm rõ khái niệm, thuật ngữ, luồng xử lý, giả định, ưu/nhược điểm và liên hệ giữa các phần. Với code/lệnh/SQL, giải thích từng thành phần và không sửa nội dung nguồn nếu chưa nêu rõ. Nội dung nguồn: {{content}}
Định dạng block: {"type":"paragraph|list|table|code|formula|diagram|json", "content":"...", "contentType":"text|table|code|latex|mermaid|plantuml|json"}. Content object/array phải có contentType rõ ràng. Chỉ gắn sơ đồ khi có thể tạo cú pháp Mermaid hợp lệ; giữ công thức trong contentType=latex.', '{"type": "object", "required": ["sections"], "properties": {"title": {"type": "string"}, "summary": {"type": "string"}, "sections": {"type": "array", "items": {"type": "object", "required": ["title", "blocks"], "properties": {"title": {"type": "string"}, "blocks": {"type": "array", "items": {"type": "object", "required": ["type", "content"], "properties": {"type": {"type": "string"}, "content": {}, "metadata": {"type": "object"}, "contentType": {"enum": ["text", "json", "latex", "mermaid", "plantuml", "table", "code"], "type": "string"}}}}, "summary": {"type": "string"}}}}}}', '{"temperature": 0.2, "maxOutputTokens": 6000}', 'true', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02');

-- validation_rules: 7 ban ghi
INSERT INTO public."validation_rules" ("id", "code", "stage", "severity", "description", "config", "is_active", "sort_order", "created_at", "updated_at") VALUES
('605dacc6-de36-4665-ad03-81742398f96c', 'input_low_text', 'input', 'warning', 'Tài liệu kỹ thuật ngắn; phần giải thích và quiz có thể ít chi tiết.', '{"min_characters": 500}', 'true', '30', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('6ac0460e-baa6-4029-b2e1-d99b11aeb9da', 'input_max_characters', 'input', 'error', 'Tổng nội dung vượt giới hạn xử lý.', '{"max_characters": 500000}', 'true', '20', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('9adf93bc-5bad-4bbe-8428-65adb1db2ae0', 'output_sections_required', 'output', 'error', 'Kết quả phân tích IT cần có mảng sections.', '{"min_sections": 1}', 'true', '10', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('9cf32b45-4128-4473-8df5-29e5d5e1d389', 'quiz_min_questions', 'quiz', 'warning', 'Quiz nên có tối thiểu ba câu hỏi.', '{"min_questions": 3}', 'true', '10', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('b94b2710-9239-46d0-956d-6b58c56c9124', 'input_text_required', 'input', 'error', 'Tài liệu IT phải trích xuất đủ văn bản hoặc nội dung code để phân tích.', '{"min_characters": 40}', 'true', '10', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('bd545495-82f7-45d6-a688-87e51058b034', 'output_section_blocks', 'output', 'warning', 'Mỗi section IT nên dùng blocks đúng kiểu như code, SQL, list, table hoặc workflow.', '{}', 'true', '20', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02'),
('c0ec20d8-deaa-4063-baef-a8af3bc063ce', 'structure_no_heading', 'structure', 'info', 'Không thấy heading kỹ thuật rõ ràng; chia tài liệu theo độ dài.', '{}', 'true', '10', '2026-10-03 01:46:15.376+02', '2026-10-03 01:46:15.376+02');

-- 5. Quyen truy cap: cac thao tac ghi di qua backend service_role
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER TABLE public."analyses" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."analyses" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."analyses" TO service_role;
ALTER TABLE public."analysis_activity" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."analysis_activity" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."analysis_activity" TO service_role;
ALTER TABLE public."analysis_chunks" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."analysis_chunks" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."analysis_chunks" TO service_role;
ALTER TABLE public."analysis_inputs" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."analysis_inputs" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."analysis_inputs" TO service_role;
ALTER TABLE public."analysis_results" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."analysis_results" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."analysis_results" TO service_role;
ALTER TABLE public."api_rate_limits" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."api_rate_limits" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."api_rate_limits" TO service_role;
ALTER TABLE public."chat_messages" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."chat_messages" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."chat_messages" TO service_role;
ALTER TABLE public."exports" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."exports" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."exports" TO service_role;
ALTER TABLE public."gemini_model_health" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."gemini_model_health" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."gemini_model_health" TO service_role;
ALTER TABLE public."generated_assets" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."generated_assets" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."generated_assets" TO service_role;
ALTER TABLE public."llm_exchanges" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."llm_exchanges" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."llm_exchanges" TO service_role;
ALTER TABLE public."profiles" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."profiles" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."profiles" TO service_role;
ALTER TABLE public."prompt_templates" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."prompt_templates" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."prompt_templates" TO service_role;
ALTER TABLE public."quiz_attempts" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."quiz_attempts" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."quiz_attempts" TO service_role;
ALTER TABLE public."quiz_questions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."quiz_questions" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."quiz_questions" TO service_role;
ALTER TABLE public."quizzes" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."quizzes" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."quizzes" TO service_role;
ALTER TABLE public."topic_specializations" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."topic_specializations" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."topic_specializations" TO service_role;
ALTER TABLE public."topics" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."topics" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."topics" TO service_role;
ALTER TABLE public."validation_rules" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."validation_rules" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."validation_rules" TO service_role;
GRANT SELECT ON public.topics, public.topic_specializations TO anon, authenticated;
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.prompt_templates, public.validation_rules, public.analyses, public.analysis_inputs, public.analysis_chunks, public.llm_exchanges, public.analysis_results, public.generated_assets, public.quizzes, public.quiz_attempts, public.chat_messages, public.exports TO authenticated;
CREATE POLICY "analysis owner delete" ON public."analyses" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "analysis owner insert" ON public."analyses" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (guest_session_hash IS NULL)));
CREATE POLICY "analysis owner read" ON public."analyses" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "analysis owner update" ON public."analyses" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "chunk owner read" ON public."analysis_chunks" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM analyses a
  WHERE ((a.id = analysis_chunks.analysis_id) AND (a.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "input owner access" ON public."analysis_inputs" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM analyses a
  WHERE ((a.id = analysis_inputs.analysis_id) AND (a.user_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM analyses a
  WHERE ((a.id = analysis_inputs.analysis_id) AND (a.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "result owner read" ON public."analysis_results" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM analyses a
  WHERE ((a.id = analysis_results.analysis_id) AND (a.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "chat owner access" ON public."chat_messages" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM analyses a
  WHERE ((a.id = chat_messages.analysis_id) AND (a.user_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM analyses a
  WHERE ((a.id = chat_messages.analysis_id) AND (a.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "export owner read" ON public."exports" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM analyses a
  WHERE ((a.id = exports.analysis_id) AND (a.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "assets owner read" ON public."generated_assets" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM analyses a
  WHERE ((a.id = generated_assets.analysis_id) AND (a.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "exchange owner read" ON public."llm_exchanges" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM analyses a
  WHERE ((a.id = llm_exchanges.analysis_id) AND (a.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "profile owner read" ON public."profiles" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "profile owner update" ON public."profiles" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((id = ( SELECT auth.uid() AS uid))) WITH CHECK ((id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "active prompt templates are readable" ON public."prompt_templates" AS PERMISSIVE FOR SELECT TO "authenticated" USING (is_active);
CREATE POLICY "attempt owner access" ON public."quiz_attempts" AS PERMISSIVE FOR ALL TO "authenticated" USING (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM (quizzes q
     JOIN analyses a ON ((a.id = q.analysis_id)))
  WHERE ((q.id = quiz_attempts.quiz_id) AND (a.user_id = ( SELECT auth.uid() AS uid))))))) WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (guest_session_hash IS NULL) AND (EXISTS ( SELECT 1
   FROM (quizzes q
     JOIN analyses a ON ((a.id = q.analysis_id)))
  WHERE ((q.id = quiz_attempts.quiz_id) AND (a.user_id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY "question owner read" ON public."quiz_questions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (quizzes q
     JOIN analyses a ON ((a.id = q.analysis_id)))
  WHERE ((q.id = quiz_questions.quiz_id) AND (a.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "quiz owner read" ON public."quizzes" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM analyses a
  WHERE ((a.id = quizzes.analysis_id) AND (a.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "active specializations are readable" ON public."topic_specializations" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (is_active);
CREATE POLICY "topics are readable" ON public."topics" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (is_active);
CREATE POLICY "active validation rules are readable" ON public."validation_rules" AS PERMISSIVE FOR SELECT TO "authenticated" USING (is_active);
NOTIFY pgrst, 'reload schema';
COMMIT;
