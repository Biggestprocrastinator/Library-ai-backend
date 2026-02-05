import { useEffect, useRef, useState } from "react";
import axios from "axios";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const TypingIndicator = () => (
  <div className="typing">
    <span>.</span><span>.</span><span>.</span>
  </div>
);

function parseBookReply(text) {
  if (!text || /not available|no books/i.test(text)) return null;
  const blocks = text.split(/\n(?=\d+\.\s+Title:)/).map(b => b.trim()).filter(Boolean);
  const items = [];

  for (const block of blocks) {
    const title = block.match(/Title:\s*(.*)/i)?.[1]?.trim();
    const author = block.match(/Author:\s*(.*)/i)?.[1]?.trim();
    const copies = block.match(/Copies:\s*(.*)/i)?.[1]?.trim();
    const location = block.match(/Location:\s*(.*)/i)?.[1]?.trim();
    const maxPages = block.match(/Max Pages:\s*(.*)/i)?.[1]?.trim();

    if (title) {
      items.push({ title, author, copies, location, maxPages });
    }
  }

  return items.length > 0 ? items : null;
}

export default function LibraryAssistantAllInOne() {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const apiBase = "https://library-ai-backend.onrender.com";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function sendQuery() {
    if (!query.trim() || loading) return;

    setMessages((m) => [...m, { role: "user", text: query }]);
    setQuery("");
    setLoading(true);

    try {
      const res = await axios.post(
        `${apiBase}/ask-ai`,
        { query }
      );

      setMessages((m) => [
        ...m,
        { role: "ai", text: res.data.reply || "No response" },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "ai", text: "Network error" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendQuery();
    }
  }

  return (
    <div className="app">
      <style>{`
        /* App shell */
        .app {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: #0b0f1a;
          color: #e5e7eb;
        }

        /* Header */
        .header {
          display: flex;
          gap: 12px;
          align-items: center;
          padding: 16px 24px;
          border-bottom: 1px solid #1f2937;
          background: #0f1525;
        }

        .logo {
          width: 40px;
          height: 40px;
          background: #2563eb;
          border-radius: 10px;
          display: grid;
          place-items: center;
          font-weight: bold;
          color: white;
        }

        .header h1 {
          margin: 0;
          font-size: 18px;
        }

        .header p {
          margin: 0;
          font-size: 12px;
          color: #9ca3af;
        }

        /* Chat area */
        .chat {
          flex: 1;
          overflow-y: auto;
          padding: 24px;
          max-width: 900px;
          width: 100%;
          margin: 0 auto;
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .chat::-webkit-scrollbar {
          display: none;
        }

        .empty {
          color: #9ca3af;
          text-align: center;
          margin-top: 120px;
        }

        /* Message rows */
        .message-row {
          display: flex;
          margin-bottom: 16px;
        }

        .message-row.user {
          justify-content: flex-end;
        }

        .message-row.ai {
          justify-content: flex-start;
        }

        /* Message bubbles */
        .msg {
          display: inline-block;
          max-width: 75%;
          width: fit-content;
          padding: 14px 16px;
          border-radius: 16px;
          line-height: 1.6;
          white-space: pre-wrap;
          word-break: break-word;
        }

        .msg.user {
          background: #2563eb;
          color: white;
        }

        .msg.ai {
          background: #11162a;
          border: 1px solid #1f2937;
        }

        /* Markdown tables */
        .msg.ai table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 8px;
        }

        .msg.ai th,
        .msg.ai td {
          border: 1px solid #1f2937;
          padding: 8px;
        }

        .msg.ai th {
          background: #1e3a8a;
        }

        /* Book cards */
        .book-list {
          display: grid;
          gap: 12px;
        }

        .book-card {
          border: 1px solid #1f2937;
          background: #0f1525;
          border-radius: 12px;
          padding: 12px 14px;
        }

        .book-title {
          font-weight: 700;
          margin-bottom: 6px;
        }

        .book-field {
          font-size: 14px;
          color: #cbd5e1;
        }

        .book-field span {
          color: #93c5fd;
          font-weight: 600;
        }

        /* Typing animation */
        .typing span {
          font-size: 24px;
          animation: blink 1.4s infinite both;
        }

        .typing span:nth-child(2) { animation-delay: .2s; }
        .typing span:nth-child(3) { animation-delay: .4s; }

        @keyframes blink {
          0% { opacity: .2; }
          20% { opacity: 1; }
          100% { opacity: .2; }
        }

        /* Input bar */
        .input-bar {
          display: flex;
          gap: 12px;
          padding: 16px;
          border-top: 1px solid #1f2937;
          background: #0f1525;
        }

        textarea {
          flex: 1;
          resize: none;
          padding: 12px;
          border-radius: 12px;
          border: 1px solid #1f2937;
          background: #11162a;
          color: white;
          font-family: inherit;
        }

        button {
          padding: 0 20px;
          border-radius: 12px;
          border: none;
          background: #2563eb;
          color: white;
          cursor: pointer;
        }
      `}</style>
      <header className="header">
        <div className="logo">AI</div>
        <div>
          <h1>Library AI Assistant</h1>
          <p>IBM watsonx · Granite · Cloudant</p>
        </div>
      </header>

      <main className="chat">
        {messages.length === 0 && (
          <div className="empty">
            Ask about books, availability, or academic topics
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`message-row ${m.role}`}>
            <div className={`msg ${m.role}`}>
              {m.role === "ai" ? (() => {
                const books = parseBookReply(m.text);
                if (books) {
                  return (
                    <div className="book-list">
                      {books.map((b, idx) => (
                        <div key={idx} className="book-card">
                          <div className="book-title">{b.title}</div>
                          {b.author && <div className="book-field"><span>Author:</span> {b.author}</div>}
                          {b.copies && <div className="book-field"><span>Copies:</span> {b.copies}</div>}
                          {b.location && <div className="book-field"><span>Location:</span> {b.location}</div>}
                          {b.maxPages && <div className="book-field"><span>Max Pages:</span> {b.maxPages}</div>}
                        </div>
                      ))}
                    </div>
                  );
                }
                return (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {m.text}
                  </ReactMarkdown>
                );
              })() : (
                m.text
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="message-row ai">
            <div className="msg ai">
              <TypingIndicator />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </main>

      <footer className="input-bar">
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask Library AI..."
        />
        <button onClick={sendQuery}>Send</button>
      </footer>
    </div>
  );
}
