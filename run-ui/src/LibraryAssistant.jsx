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
              {m.role === "ai" ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {m.text}
                </ReactMarkdown>
              ) : (
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
