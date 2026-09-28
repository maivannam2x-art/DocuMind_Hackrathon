-- Correct answers are delivered only by the scoring endpoint, never PostgREST.
revoke select on public.quiz_questions from anon, authenticated;

