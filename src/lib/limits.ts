export const INPUT_LIMITS = { maxFiles: 10, maxFileBytes: 20 * 1024 * 1024, maxTextCharacters: 500000, extensions: ['pdf','docx','txt','md','markdown','csv','json','xml','yaml','yml','log','html','css','js','jsx','ts','tsx','py','java','c','cpp','h','cs','go','rs','sql','sh','png','jpg','jpeg'] } as const;
export const FILE_ACCEPT = INPUT_LIMITS.extensions.map(ext => `.${ext}`).join(',');
export function supportedFile(name: string) { return (INPUT_LIMITS.extensions as readonly string[]).includes(name.split('.').at(-1)?.toLowerCase() ?? ''); }
