"use client";
import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";

export type ChatMessage = { id?: string; role: "user" | "assistant"; content: string; citations?: string[] };

const SUGGESTIONS = [
  "Tóm tắt những ý quan trọng nhất trong tài liệu",
  "Giải thích thuật ngữ quan trọng nhất trong tài liệu",
  "Cho mình một ví dụ áp dụng nội dung này",
];

/** Renders plain-text answers with paragraphs and "•"/"-" bullet lines, never as HTML. */
function MessageBody({ content }: { content: string }) {
  const blocks = content.split(/\n{2,}/);
  return <>{blocks.map((block, index) => {
    const lines = block.split("\n").filter(line => line.trim());
    if (lines.length && lines.every(line => /^\s*(?:[•\-*]|\d+[.)])\s+/.test(line))) {
      return <ul key={index}>{lines.map((line, lineIndex) => <li key={lineIndex}>{line.replace(/^\s*(?:[•\-*]|\d+[.)])\s+/, "")}</li>)}</ul>;
    }
    return <p key={index}>{lines.map((line, lineIndex) => <span key={lineIndex}>{lineIndex > 0 && <br />}{line}</span>)}</p>;
  })}</>;
}

export function ChatPanel({ messages, pending, loadError, onSend, onReload, className = "panel chat-panel" }: {
  messages: ChatMessage[];
  pending: boolean;
  loadError: string;
  onSend: (message: string) => Promise<boolean>;
  onReload: () => void;
  className?: string;
}) {
  const [input, setInput] = useState("");
  const [copied, setCopied] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
  }, [messages.length, pending]);

  async function send(message: string) {
    const value = message.trim();
    if (!value || pending) return;
    setInput("");
    const sent = await onSend(value);
    if (!sent) setInput(value);
    inputRef.current?.focus();
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(input);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send(input);
    }
  }

  async function copy(index: number, content: string) {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(index);
      window.setTimeout(() => setCopied(current => current === index ? null : current), 1600);
    } catch { /* Clipboard can be blocked by browser permissions. */ }
  }

  return <section className={className}>
    <div className="chat-heading"><span className="chat-spark">✦</span><div><h3>Hỏi đáp cùng AI</h3><small>Dựa trên tài liệu đã phân tích</small></div><button title="Tải lại hội thoại" aria-label="Tải lại hội thoại" onClick={onReload}>↻</button></div>
    {loadError && <div className="inline-error" role="alert">{loadError}<button onClick={onReload}>Thử lại</button></div>}
    <div className="chat-messages" ref={listRef} aria-live="polite">
      {messages.length === 0 && !pending ? <div className="chat-welcome"><span className="ai-avatar">✦</span><p>Chào bạn! Mình đã đọc tài liệu này. Bạn có thể hỏi về bất kỳ phần nào trong nội dung.</p>
        {SUGGESTIONS.map(suggestion => <button key={suggestion} disabled={pending} onClick={() => void send(suggestion)}>{suggestion} <span>↗</span></button>)}
      </div> : messages.map((message, index) => <div className={`chat-message ${message.role}`} key={message.id ?? index}>
        <div className="chat-role">{message.role === "user" ? "Bạn" : "AI · Dựa trên tài liệu"}</div>
        <div className="chat-body"><MessageBody content={message.content} /></div>
        {message.role === "assistant" && <div className="chat-meta">
          {message.citations?.length ? <div className="chat-citations"><span>Nguồn:</span>{message.citations.map(citation => <em key={citation}>{citation}</em>)}</div> : null}
          <button className="chat-copy" onClick={() => void copy(index, message.content)}>{copied === index ? "Đã chép ✓" : "Sao chép"}</button>
        </div>}
      </div>)}
      {pending && <div className="chat-message assistant chat-typing" aria-label="AI đang trả lời"><div className="chat-role">AI đang đọc tài liệu</div><span className="typing-dots"><i /><i /><i /></span></div>}
    </div>
    <form className="chat-form" onSubmit={onSubmit}>
      <textarea ref={inputRef} value={input} onChange={event => setInput(event.target.value)} onKeyDown={onKeyDown} maxLength={4000} rows={2} placeholder="Hỏi tiếp về tài liệu... (Enter để gửi, Shift+Enter xuống dòng)" aria-label="Câu hỏi cho AI" />
      <button type="submit" disabled={pending || !input.trim()} aria-label="Gửi câu hỏi">↑</button>
    </form>
    <div className="chat-disclaimer">AI có thể sai. Hãy kiểm tra nội dung với tài liệu gốc.{input.length > 3500 ? ` · ${input.length}/4000 ký tự` : ""}</div>
  </section>;
}
