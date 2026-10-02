// Shared fixture: separate catalog discovery from generateContent calls.
export const testCatalog = () => new Response(JSON.stringify({models:["gemini-3.8-flash","gemini-3.5-flash","gemini-2.5-flash"].map(id=>({name:`models/${id}`,supportedGenerationMethods:["generateContent"]}))}));
