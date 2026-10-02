import fs from 'node:fs';
const migrations = fs.readdirSync('supabase/migrations').filter(p => p.endsWith('.sql')).sort();
const strip = text => text.replace(/^\s*(begin|commit);\s*$/gmi, '');
const sources = [];
for (const file of migrations) {
  sources.push(`supabase/migrations/${file}`);
  if (file === '20260929051348_documind_visual_assets.sql')
    sources.push('database/02_it_catalog_enhancement.sql', 'database/04_foreign_key_indexes.sql');
}
const guard = `DO $$ BEGIN
  IF to_regclass('auth.users') IS NULL OR to_regclass('storage.buckets') IS NULL THEN
    RAISE EXCEPTION 'Run only in an initialized Supabase project (managed auth/storage required).';
  END IF;
  IF to_regclass('public.analyses') IS NOT NULL OR to_regclass('public.profiles') IS NOT NULL THEN
    RAISE EXCEPTION 'Fresh project only: DocuMind tables already exist. Use a reviewed incremental migration instead.';
  END IF;
END $$;`;
const grants = `-- Explicit grants work with new projects where automatic public exposure is disabled.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['profiles','topics','topic_specializations','prompt_templates','validation_rules','analyses','analysis_inputs','analysis_chunks','llm_exchanges','analysis_results','generated_assets','quizzes','quiz_questions','quiz_attempts','chat_messages','exports','api_rate_limits','analysis_activity','gemini_model_health'] LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', t);
  END LOOP;
END $$;
GRANT SELECT ON public.topics, public.topic_specializations TO anon, authenticated;
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.prompt_templates, public.validation_rules, public.analyses, public.analysis_inputs, public.analysis_chunks, public.llm_exchanges, public.analysis_results, public.generated_assets, public.quizzes, public.quiz_attempts, public.chat_messages, public.exports TO authenticated;
-- quiz_questions (answer keys), quotas, activity and model health remain API-only.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_api_quota(text,integer,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gemini_circuit_event(text,text,text,bigint,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_api_quota(text,integer,integer), public.gemini_circuit_event(text,text,text,bigint,integer) TO service_role;
NOTIFY pgrst, 'reload schema';`;
const sql = `-- DOCUMIND / FRESH SUPABASE ONLY / GENERATED, NO USER DATA OR SECRETS\n-- Application tables: public. Supabase-managed auth/storage are required, not recreated.\n-- Run once as postgres in SQL Editor; do not replay the individual migrations afterward.\n-- Sources: ${migrations.length} migrations + IT enhancements + FK indexes.\nBEGIN;\n${guard}\n` + sources.map(p => `\n-- SOURCE: ${p}\n${strip(fs.readFileSync(p, 'utf8'))}`).join('\n') + `\n${grants}\nCOMMIT;\n`;
fs.writeFileSync('database/01_fresh_production_bootstrap.sql', sql);
console.log(JSON.stringify({sources: sources.length, bytes: Buffer.byteLength(sql)}));
