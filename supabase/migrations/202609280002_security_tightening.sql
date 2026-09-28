-- Browser clients use the API for state transitions. Keep direct PostgREST access read-only.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke insert, update, delete on public.analyses from authenticated;
revoke insert, update, delete on public.analysis_inputs from authenticated;
revoke insert, update, delete on public.analysis_chunks from authenticated;
revoke insert, update, delete on public.llm_exchanges from authenticated;
revoke insert, update, delete on public.analysis_results from authenticated;
revoke insert, update, delete on public.generated_assets from authenticated;
revoke insert, update, delete on public.quizzes from authenticated;
revoke insert, update, delete on public.quiz_questions from authenticated;
revoke insert, update, delete on public.quiz_attempts from authenticated;
revoke insert, update, delete on public.chat_messages from authenticated;
revoke insert, update, delete on public.exports from authenticated;
grant select on public.analyses, public.analysis_inputs, public.analysis_chunks,
  public.llm_exchanges, public.analysis_results, public.generated_assets,
  public.quizzes, public.quiz_questions, public.quiz_attempts, public.chat_messages,
  public.exports to authenticated;

