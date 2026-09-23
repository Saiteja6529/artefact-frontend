import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import './App.css';

const CATALOG = {
  indian: {
    label: 'Indian',
    books: [
      { value: 'rigveda', label: 'Rigveda' },
      { value: 'ramayana', label: 'Ramayana' },
      { value: 'mahabharata', label: 'Mahabharata' },
      { value: 'gita', label: 'Bhagavad Gita' },
    ],
  },
  greek: {
    label: 'Greek',
    books: [
      { value: 'iliad', label: 'Iliad' },
      { value: 'odyssey', label: 'Odyssey' },
    ],
  },
};

const API_BASE_URL =
  process.env.REACT_APP_API_BASE_URL || (process.env.NODE_ENV === 'development' ? 'http://127.0.0.1:5000' : '');

function apiUrl(path) {
  return `${API_BASE_URL}${path}`;
}

function groupSessions(sessions) {
  const now = Date.now();
  const day = 86400000;
  const groups = { Today: [], Yesterday: [], Earlier: [] };

  sessions.forEach((session) => {
    const age = now - session.ts;
    if (age < day) groups.Today.push(session);
    else if (age < day * 2) groups.Yesterday.push(session);
    else groups.Earlier.push(session);
  });

  return groups;
}

function getBooks(civilization) {
  return CATALOG[civilization]?.books ?? [];
}

function getBookLabel(civilization, bookValue) {
  return getBooks(civilization).find((book) => book.value === bookValue)?.label ?? bookValue;
}

function sanitizeAnswerText(text) {
  return typeof text === 'string' ? text.replace(/\*\*/g, '') : '';
}

export default function App() {
  const [q, setQ] = useState('');
  const [chat, setChat] = useState([]);
  const [busy, setBusy] = useState(false);
  const [voiceLoadingId, setVoiceLoadingId] = useState(null);
  const [voicePlayingId, setVoicePlayingId] = useState(null);
  const [open, setOpen] = useState(true);
  const [showIntro, setShowIntro] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [active, setActive] = useState(null);
  const [civilization, setCivilization] = useState('');
  const [book, setBook] = useState('');

  const audioRef = useRef(null);
  const audioHandlersRef = useRef(null);
  const audioUrlRef = useRef(null);
  const msgRef = useRef(null);
  const inRef = useRef(null);

  useEffect(() => {
    if (msgRef.current && typeof msgRef.current.scrollTo === 'function') {
      msgRef.current.scrollTo({ top: msgRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [chat, busy]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setShowIntro(false);
    }, 2400);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(
    () => () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeEventListener('ended', audioHandlersRef.current?.clearPlayback);
        audioRef.current.removeEventListener('pause', audioHandlersRef.current?.clearPlayback);
      }

      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
    },
    [],
  );

  const ensureAudio = () => {
    if (audioRef.current) return audioRef.current;

    const audio = new Audio();
    const clearPlayback = () => {
      setVoicePlayingId(null);
    };

    audio.addEventListener('ended', clearPlayback);
    audio.addEventListener('pause', clearPlayback);
    audioHandlersRef.current = { clearPlayback };
    audioRef.current = audio;
    return audio;
  };

  const clearAudioSource = () => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      audio.removeAttribute('src');
      audio.load();
    }

    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  };

  const playVoice = async (messageId, text) => {
    const sanitizedText = sanitizeAnswerText(text);
    if (!sanitizedText || voiceLoadingId === messageId) return;

    const audio = ensureAudio();

    if (voicePlayingId === messageId && !audio.paused) {
      clearAudioSource();
      setVoicePlayingId(null);
      return;
    }

    setVoiceLoadingId(messageId);
    setVoicePlayingId(null);

    try {
      clearAudioSource();

      const response = await axios.post(
        apiUrl('/synthesize'),
        { text: sanitizedText },
        { responseType: 'blob' },
      );

      const audioUrl = URL.createObjectURL(response.data);
      audioUrlRef.current = audioUrl;
      audio.src = audioUrl;
      setVoicePlayingId(messageId);
      await audio.play();
    } catch {
      clearAudioSource();
      setVoicePlayingId(null);
    } finally {
      setVoiceLoadingId(null);
    }
  };

  const resetChat = () => {
    clearAudioSource();
    setVoiceLoadingId(null);
    setVoicePlayingId(null);
    setChat([]);
    setActive(null);
    setQ('');
    inRef.current?.focus();
  };

  const newChat = () => {
    resetChat();
  };

  const loadSession = (session) => {
    clearAudioSource();
    setVoiceLoadingId(null);
    setVoicePlayingId(null);
    setChat(session.msgs);
    setActive(session.id);
    setCivilization(session.civilization);
    setBook(session.book);
    inRef.current?.focus();
  };

  const switchScope = (nextCivilization, nextBook) => {
    setCivilization(nextCivilization);
    setBook(nextBook);
    resetChat();
  };

  const send = async () => {
    if (!q.trim() || busy || !civilization || !book) return;

    const userMsg = { role: 'user', text: q.trim() };
    const next = [...chat, userMsg];
    const pendingMessages = [...next, { role: 'bot', text: '' }];
    const currentQuestion = q.trim();
    const currentCivilization = civilization;
    const currentBook = book;
    const currentActive = active;

    setChat(pendingMessages);
    setBusy(true);
    setQ('');

    let answer = '';

    try {
      const response = await fetch(apiUrl('/chat/stream'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: currentQuestion,
          category: currentCivilization,
          book: currentBook,
          history: chat.map((message) => ({
            sender: message.role === 'bot' ? 'bot' : 'user',
            text: message.text,
          })),
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error('Streaming request failed');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        answer += decoder.decode(value, { stream: true });
        const streamedAnswer = sanitizeAnswerText(answer);

        setChat((prev) => {
          const updated = [...prev];
          const lastMessage = updated[updated.length - 1];
          if (lastMessage?.role === 'bot') {
            updated[updated.length - 1] = { ...lastMessage, text: streamedAnswer };
          }
          return updated;
        });
      }

      answer += decoder.decode();
      answer = sanitizeAnswerText(answer);
    } catch {
      answer = 'The Oracle is silent. Check the backend.';
    }

    const finalMessages = [...next, { role: 'bot', text: answer }];
    setChat(finalMessages);
    setBusy(false);

    setSessions((prev) => {
      const title =
        currentQuestion.length > 42 ? `${currentQuestion.slice(0, 42)}...` : currentQuestion;

      if (currentActive) {
        const updated = prev.map((session) =>
          session.id === currentActive
            ? {
                ...session,
                msgs: finalMessages,
                title,
                civilization: currentCivilization,
                book: currentBook,
                ts: Date.now(),
              }
            : session,
        );

        return updated.sort((a, b) => b.ts - a.ts);
      }

      const session = {
        id: String(Date.now()),
        title,
        msgs: finalMessages,
        ts: Date.now(),
        civilization: currentCivilization,
        book: currentBook,
      };

      setActive(session.id);
      return [session, ...prev];
    });
  };

  const groups = groupSessions(sessions);
  const currentBooks = getBooks(civilization);
  const hasScopeSelection = Boolean(civilization && book);

  return (
    <>
      <div className="app-bg" />
      {showIntro && (
        <div className="intro-screen" onClick={() => setShowIntro(false)}>
          <div className="intro-panel">
            
            <h1 className="intro-name">ARTEFACT</h1>
            <p className="intro-line">Defy the Gods</p>
          </div>
        </div>
      )}

      <div className={`app-shell ${showIntro ? 'intro-active' : 'intro-done'}`}>
        <aside className={`sidebar ${open ? '' : 'closed'}`}>
          <div className="sidebar-inner">
            <div className="sidebar-header">
              <div className="brand">
                <div className="brand-name">Artefact</div>
                <div className="brand-tag">Defy the Gods</div>
              </div>
              <button className="btn-close" onClick={() => setOpen(false)} type="button">
                X
              </button>
            </div>

            <button className="btn-new" onClick={newChat} type="button">
              + New Conversation
            </button>

            <div className="history">
              {sessions.length === 0 && <div className="h-empty">Your scrolls will appear here...</div>}
              {Object.entries(groups).map(
                ([label, items]) =>
                  items.length > 0 && (
                    <div key={label}>
                      <div className="h-label">{label}</div>
                      {items.map((session) => (
                        <button
                          key={session.id}
                          className={`h-item ${active === session.id ? 'active' : ''}`}
                          onClick={() => loadSession(session)}
                          title={session.title}
                          type="button"
                        >
                          <span className="h-dot">[]</span>
                          <span className="h-copy">
                            <span className="h-title">{session.title}</span>
                            <span className="h-meta">
                              {CATALOG[session.civilization]?.label} |{' '}
                              {getBookLabel(session.civilization, session.book)}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  ),
              )}
            </div>
          </div>
        </aside>

        <main className="chat-main">
          <div className={`topbar ${open ? '' : 'show'}`}>
            <button className="btn-open" onClick={() => setOpen(true)} type="button">
              =
            </button>
          </div>

          <div className="scope-bar">
            <div className="scope-fields">
              <label className="scope-field">
                <span className="scope-label">Civilization</span>
                <select
                  value={civilization}
                  onChange={(event) => {
                    const nextCivilization = event.target.value;
                    switchScope(nextCivilization, '');
                  }}
                >
                  <option value="">Select civilization</option>
                  {Object.entries(CATALOG).map(([value, item]) => (
                    <option key={value} value={value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="scope-field">
                <span className="scope-label">Book</span>
                <select
                  value={book}
                  disabled={!civilization}
                  onChange={(event) => switchScope(civilization, event.target.value)}
                >
                  <option value="">
                    {civilization ? 'Select book' : 'Choose civilization'}
                  </option>
                  {currentBooks.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

           
          </div>

          <div className="messages" ref={msgRef}>
            {chat.length === 0 ? (
              <div className="welcome">
                <p className="welcome-credit">Mythology Retrieval Interface</p>
                <h1 className="welcome-title">ARTEFACT</h1>
                <p className="welcome-tagline">DEFY THE GODS</p>
              </div>
            ) : (
              <div className="chat-list">
                {chat.map((message, index) => {
                  const messageId = `${index}-${message.role}`;
                  const isVoiceLoading = voiceLoadingId === messageId;
                  const isVoicePlaying = voicePlayingId === messageId;

                  return (
                    <div key={messageId} className={`row ${message.role}`}>
                      {message.role === 'bot' && <div className="av bot">AI</div>}
                      <div className="bubble">
                        <div className="bubble-text">{sanitizeAnswerText(message.text)}</div>
                        {message.role === 'bot' && sanitizeAnswerText(message.text) && (
                          <button
                            className={`voice-btn ${isVoicePlaying ? 'playing' : ''}`}
                            onClick={() => playVoice(messageId, message.text)}
                            disabled={isVoiceLoading}
                            type="button"
                          >
                            {isVoiceLoading
                              ? 'Loading voice...'
                              : isVoicePlaying
                                ? 'Stop voice'
                                : 'Play voice'}
                          </button>
                        )}
                      </div>
                      {message.role === 'user' && <div className="av">U</div>}
                    </div>
                  );
                })}
                {busy && !sanitizeAnswerText(chat[chat.length - 1]?.text) && (
                  <div className="row bot">
                    <div className="av bot">AI</div>
                    <div className="bubble">
                      <div className="dots">
                        <span />
                        <span />
                        <span />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="input-wrap">
            <div className="pill">
              <input
                ref={inRef}
                disabled={!hasScopeSelection}
                value={q}
                onChange={(event) => setQ(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && send()}
                placeholder={
                  hasScopeSelection
                    ? `Ask about ${getBookLabel(civilization, book)}...`
                    : 'Choose a civilization and book to start'
                }
              />
              <button
                className="btn-send"
                onClick={send}
                disabled={busy || !q.trim() || !hasScopeSelection}
                type="button"
              >
                Send
              </button>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
