import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [input, setInput] = useState('');
  const [allChats, setAllChats] = useState({}); // { id: [messages] }
  const [activeChatId, setActiveChatId] = useState(null);
  const [history, setHistory] = useState([]); // List of {id, title}
  const [theme, setTheme] = useState('dark');
  const [category, setCategory] = useState('greek');
  const [book, setBook] = useState('iliad');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const messagesEndRef = useRef(null);
  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(scrollToBottom, [allChats, activeChatId]);

  const handleNewChat = () => {
    setActiveChatId(null);
    setInput('');
  };

  const sendMessage = async (e) => {
    if (e) e.preventDefault();
    if (!input.trim()) return;

    let chatId = activeChatId;
    if (!chatId) {
      chatId = Date.now().toString();
      setActiveChatId(chatId);
      const title = input.length > 20 ? input.substring(0, 20) + "..." : input;
      setHistory(prev => [{ id: chatId, title }, ...prev]);
    }

    const userMsg = { text: input, sender: 'user' };
    setAllChats(prev => ({
      ...prev,
      [chatId]: [...(prev[chatId] || []), userMsg]
    }));

    const currentInput = input;
    setInput('');

    try {
      const response = await axios.post('http://127.0.0.1:5000/chat', {
        query: currentInput,
        category: category,
        book: book
      });
      const botMsg = { text: response.data.answer, sender: 'bot' };
      setAllChats(prev => ({
        ...prev,
        [chatId]: [...(prev[chatId] || []), botMsg]
      }));
    } catch (error) {
      setAllChats(prev => ({
        ...prev,
        [chatId]: [...(prev[chatId] || []), { text: "Error connecting to Llama 3.", sender: 'bot' }]
      }));
    }
  };

  const currentMessages = activeChatId ? allChats[activeChatId] : [];

  return (
    <div className={`app-container ${theme}-theme`}>
      <aside className="sidebar">
        <div className="sidebar-top">
          <button className="new-chat-btn" onClick={handleNewChat}>
            <span>+</span> New Chat
          </button>
          <div className="history-list">
            <p className="section-label">History</p>
            {history.map(item => (
              <div 
                key={item.id} 
                className={`history-item ${activeChatId === item.id ? 'active' : ''}`}
                onClick={() => setActiveChatId(item.id)}
              >
                💬 {item.title}
              </div>
            ))}
          </div>
        </div>
        
        <div className="sidebar-bottom">
          <button className="settings-trigger" onClick={() => setIsSettingsOpen(true)}>
            ⚙️ Settings
          </button>
        </div>
      </aside>

      <main className="chat-viewport">
        <header className="selection-header">
          <div className="custom-select">
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="greek">Greek</option>
              <option value="indian">Indian</option>
            </select>
          </div>
          <div className="custom-select book-scroll">
            <select value={book} onChange={(e) => setBook(e.target.value)}>
              {/* This list can grow; the CSS below handles the scroll */}
              {category === 'greek' ? (
                <>
                  <option value="iliad">The Iliad</option>
                  <option value="odyssey">The Odyssey</option>
                </>
              ) : (
                <>
                  <option value="gita">Bhagavad Gita</option>
                  <option value="mahabharata">Mahabharata</option>
                  <option value="ramayana">Ramayana</option>
                  <option value="rigveda">Rigveda</option>
                </>
              )}
            </select>
          </div>
        </header>

        <section className="chat-area">
          {currentMessages.length === 0 ? (
            <div className="welcome-text">Select a book and begin your journey.</div>
          ) : (
            currentMessages.map((m, i) => (
              <div key={i} className={`msg-row ${m.sender}`}>
                <div className="msg-bubble">{m.text}</div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </section>

        <footer className="input-container">
          <form className="input-box" onSubmit={sendMessage}>
            <input 
              value={input} 
              onChange={(e) => setInput(e.target.value)} 
              placeholder={`Ask about ${book}...`}
            />
            <button type="submit">➔</button>
          </form>
        </footer>

        {isSettingsOpen && (
          <div className="modal-overlay" onClick={() => setIsSettingsOpen(false)}>
            <div className="modal-card" onClick={e => e.stopPropagation()}>
              <h3>Settings</h3>
              <div className="theme-options">
                <button onClick={() => setTheme('dark')}>Dark Mode</button>
                <button onClick={() => setTheme('light')}>Light Mode</button>
              </div>
              <button className="close-btn" onClick={() => setIsSettingsOpen(false)}>Close</button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;