import { useEffect, useRef, useState } from "react";
import axios from "axios";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./library-ai.css";

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

export default function LibraryAssistant() {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

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
        "https://library-ai-backend.onrender.com/ask-ai",
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
