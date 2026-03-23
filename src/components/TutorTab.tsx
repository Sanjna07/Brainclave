/**
 * TutorTab.tsx — BrainClave Tutor Assistant
 *
 * A unified multimodal AI teaching assistant that combines:
 * - Text chat with teacher persona
 * - Image upload & camera capture (via VLM)
 * - PDF/file text extraction
 * - Voice mic via Web Speech API
 * - Memory-aware personalised responses
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { ModelCategory, VideoCapture } from '@runanywhere/web';
import { TextGeneration, VLMWorkerBridge } from '@runanywhere/web-llamacpp';
import { useModelLoader } from '../hooks/useModelLoader';
import { useMemory } from '../hooks/useMemory';

// ─── Types & Interfaces ───────────────────────────────────────────────────────

// Web Speech API interfaces for TS
interface SpeechRecognitionEvent {
  results: { [index: number]: { [index: number]: { transcript: string } } };
}
interface SpeechRecognition extends EventTarget {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: any) => void;
  onend: () => void;
}

type InputMode = 'text' | 'voice' | 'image' | 'camera';

interface Attachment {
  type: 'image' | 'pdf';
  name: string;
  preview?: string;      // data URL for images
  textContent?: string;  // extracted text for PDFs/docs
  imageData?: { pixels: Uint8Array; width: number; height: number };
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachment?: Attachment;
  mode: InputMode;
  timestamp: Date;
  streaming?: boolean;
  tokens?: number;
  tokPerSec?: number;
}

// ─── Simple Markdown renderer ─────────────────────────────────────────────────

function renderMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    .replace(/^[-•] (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`)
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[hul])(.+)$/gm, (line) => line.startsWith('<') ? line : `<p>${line}</p>`);
}

// ─── Icon SVGs (inline, no dependency) ───────────────────────────────────────

const SendIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"></line>
    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
  </svg>
);
const MicIcon = ({ active }: { active?: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
    <line x1="12" y1="19" x2="12" y2="22"/>
    <line x1="8" y1="22" x2="16" y2="22"/>
  </svg>
);
const ImageIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/>
    <circle cx="8.5" cy="8.5" r="1.5"/>
    <polyline points="21 15 16 10 5 21"/>
  </svg>
);
const CameraIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
    <circle cx="12" cy="13" r="4"/>
  </svg>
);
const FileIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
    <polyline points="10 9 9 9 8 9"/>
  </svg>
);
const XIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);
const StopIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <rect x="4" y="4" width="16" height="16" rx="2"/>
  </svg>
);

// ─── Component ────────────────────────────────────────────────────────────────

export function TutorTab() {
  const llmLoader = useModelLoader(ModelCategory.Language);
  const vlmLoader = useModelLoader(ModelCategory.Multimodal);
  const memory = useMemory();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [generating, setGenerating] = useState(false);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [statusText, setStatusText] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const captureRef = useRef<VideoCapture | null>(null);
  const videoMountRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      captureRef.current?.stop();
      captureRef.current?.videoElement.parentNode?.removeChild(captureRef.current.videoElement);
    };
  }, []);

  // ── Build teacher system prompt from memory ──────────────────────────────────
  const systemPrompt = useMemo(() => {
    const subjects = memory.subjects.map(s => s.name).join(', ') || 'none yet';
    const weakTopics = memory.weakTopics.filter(w => !w.resolved).map(w => `${w.topic}`).join(', ') || 'none identified';
    const pendingTasks = memory.tasks.filter(t => t.status === 'pending').map(t => t.title).join(', ') || 'none';

    return `You are BrainClave, a personalised intelligent tutor — not a generic AI chatbot. You know this student well:
- Their subjects: ${subjects}
- Weak areas to strengthen: ${weakTopics}
- Pending tasks: ${pendingTasks}

        Your teaching style:
        1. For conceptual questions: give a 1-line TL;DR first, then very brief bullets
        2. Give hints first rather than full answers if they are stuck on a problem
        3. Relate to their known subjects if relevant
        4. Keep it EXTREMELY concise. Respond in 2-3 short sentences. Speed is priority!
        5. Use **bold** for key terms`;
  }, [memory.subjects, memory.weakTopics, memory.tasks]);

  // ── Send message ─────────────────────────────────────────────────────────────
  const send = useCallback(async (overrideText?: string, overrideAttachment?: Attachment | null, mode: InputMode = 'text') => {
    const text = (overrideText ?? input).trim();
    if ((!text && !overrideAttachment && !attachment) || generating) return;

    const finalAttachment = overrideAttachment !== undefined ? overrideAttachment : attachment;
    const displayText = text || (finalAttachment ? `[Asking about ${finalAttachment.name}]` : '');
    const msgId = Date.now().toString();

    const userMsg: Message = {
      id: msgId,
      role: 'user',
      content: displayText,
      attachment: finalAttachment ?? undefined,
      mode,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setAttachment(null);
    setGenerating(true);
    setStatusText('Thinking…');

    const assistantId = msgId + '_a';
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '', mode: 'text', timestamp: new Date(), streaming: true }]);

    try {
      // If image attachment — use VLM
      if (finalAttachment?.type === 'image' && finalAttachment.imageData) {
        if (vlmLoader.state !== 'ready') {
          setStatusText('Loading vision model…');
          const ok = await vlmLoader.ensure();
          if (!ok) throw new Error('Vision model failed to load.');
        }
        setStatusText('Analysing image…');
        const bridge = VLMWorkerBridge.shared;
        const imgQuery = text || 'Describe what you see in this image and explain it clearly.';
        const res = await bridge.process(
          finalAttachment.imageData.pixels,
          finalAttachment.imageData.width,
          finalAttachment.imageData.height,
          imgQuery,
          { maxTokens: 300, temperature: 0.6 },
        );
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: res.text, streaming: false } : m));
        if (memory.addHistory) memory.addHistory(mode, 'user', displayText);
        if (memory.addHistory) memory.addHistory('text', 'assistant', res.text);
        return;
      }

      // Text LLM path
      if (llmLoader.state !== 'ready') {
        setStatusText('Loading AI model…');
        const ok = await llmLoader.ensure();
        if (!ok) throw new Error('Language model failed to load.');
      }
      setStatusText('Generating…');

      // Build full prompt
      const pdfContext = finalAttachment?.textContent ? `\n\n[Document content provided by user]:\n${finalAttachment.textContent.slice(0, 2000)}` : '';
      const fullPrompt = `${systemPrompt}\n\nQuestion: ${text}${pdfContext}`;

      const { stream, result: resultPromise, cancel } = await TextGeneration.generateStream(fullPrompt, {
        maxTokens: 200,
        temperature: 0.7,
        top_k: 40,
      });
      cancelRef.current = cancel;

      let accumulated = '';
      for await (const token of stream) {
        accumulated += token;
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: accumulated } : m));
      }
      const result = await resultPromise;
      const finalText = result.text || accumulated;
      setMessages(prev => prev.map(m => m.id === assistantId
        ? { ...m, content: finalText, streaming: false, tokens: result.tokensUsed, tokPerSec: result.tokensPerSecond }
        : m
      ));

      if (memory.addHistory) {
        memory.addHistory(mode, 'user', displayText);
        memory.addHistory('text', 'assistant', finalText);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: `Error: ${msg}`, streaming: false } : m));
    } finally {
      setGenerating(false);
      cancelRef.current = null;
      setStatusText('');
    }
  }, [input, attachment, generating, systemPrompt, llmLoader, vlmLoader, memory]);

  // ── Voice mic ─────────────────────────────────────────────────────────────────
  const toggleMic = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setStatusText('Voice not supported in this browser'); return; }

    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }
    const rec: SpeechRecognition = new SR();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = e.results[0][0].transcript;
      setInput(prev => (prev ? prev + ' ' : '') + transcript);
    };
    rec.onerror = () => setIsRecording(false);
    rec.onend = () => setIsRecording(false);
    rec.start();
    recognitionRef.current = rec;
    setIsRecording(true);
  }, [isRecording]);

  // ── Image file pick ───────────────────────────────────────────────────────────
  const handleImageFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      // Draw to canvas to get pixel data for VLM
      const img = new Image();
      img.onload = () => {
        const DIM = 336;
        const canvas = document.createElement('canvas');
        canvas.width = DIM; canvas.height = DIM;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, DIM, DIM);
        const imageData = ctx.getImageData(0, 0, DIM, DIM);
        const pixels = new Uint8Array(DIM * DIM * 3);
        for (let i = 0; i < DIM * DIM; i++) {
          pixels[i * 3] = imageData.data[i * 4];
          pixels[i * 3 + 1] = imageData.data[i * 4 + 1];
          pixels[i * 3 + 2] = imageData.data[i * 4 + 2];
        }
        setAttachment({ type: 'image', name: file.name, preview: dataUrl, imageData: { pixels, width: DIM, height: DIM } });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }, []);

  // ── PDF / text file pick ───────────────────────────────────────────────────────
  const handleDocFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setAttachment({ type: 'pdf', name: file.name, textContent: content.slice(0, 4000) });
    };
    reader.readAsText(file);
  }, []);

  // ── Camera ─────────────────────────────────────────────────────────────────────
  const openCamera = useCallback(async () => {
    setCameraOpen(true);
    setCameraReady(false);
    try {
      const cam = new VideoCapture({ facingMode: 'environment' });
      await cam.start();
      captureRef.current = cam;
      if (videoMountRef.current) {
        const el = cam.videoElement;
        el.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:12px;';
        videoMountRef.current.appendChild(el);
      }
      setCameraReady(true);
    } catch {
      setStatusText('Camera access denied.');
      setCameraOpen(false);
    }
  }, []);

  const snapAndSend = useCallback(async () => {
    if (!captureRef.current?.isCapturing) return;
    const frame = captureRef.current.captureFrame(336);
    if (!frame) return;
    const cam = captureRef.current;
    cam.stop();
    cam.videoElement.parentNode?.removeChild(cam.videoElement);
    captureRef.current = null;
    setCameraOpen(false);
    setCameraReady(false);
    const snap: Attachment = {
      type: 'image', name: 'Camera shot',
      imageData: { pixels: new Uint8Array(frame.rgbPixels), width: frame.width, height: frame.height },
    };
    await send(input, snap, 'camera');
  }, [input, send]);

  const closeCamera = useCallback(() => {
    captureRef.current?.stop();
    captureRef.current?.videoElement.parentNode?.removeChild(captureRef.current.videoElement);
    captureRef.current = null;
    setCameraOpen(false);
    setCameraReady(false);
  }, []);

  // ── Keyboard shortcut ──────────────────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="tutor-panel">

      {/* ── Messages ─────────────────────────────────────────────────────────── */}
      <div className="tutor-messages">
        {messages.length === 0 && (
          <div className="tutor-welcome">
            <div className="tutor-welcome-logo">BC</div>
            <h2>BrainClave Tutor</h2>
            <p>Your personal study companion. Ask me anything — type it, say it, take a photo, or upload a document.</p>
            <div className="tutor-starter-chips">
              <button onClick={() => setInput('Explain this concept to me like I\'m a beginner')}>Explain a concept</button>
              <button onClick={() => setInput('Help me understand why this answer is wrong')}>Debug my thinking</button>
              <button onClick={() => setInput('Summarise my weak topics and make a study plan')}>Study plan</button>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`tutor-msg tutor-msg-${msg.role}`}>
            {msg.role === 'assistant' && (
              <div className="tutor-avatar">BC</div>
            )}
            <div className="tutor-bubble">
              {msg.attachment?.preview && (
                <img src={msg.attachment.preview} alt="attachment" className="tutor-attachment-img" />
              )}
              {msg.attachment?.type === 'pdf' && (
                <div className="tutor-attachment-doc">
                  <FileIcon /> <span>{msg.attachment.name}</span>
                </div>
              )}
              {msg.attachment?.type === 'image' && !msg.attachment.preview && (
                <div className="tutor-attachment-doc">
                  <CameraIcon /> <span>{msg.attachment.name}</span>
                </div>
              )}
              {msg.role === 'assistant' ? (
                <div
                  className="tutor-md"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content || (msg.streaming ? '…' : '')) }}
                />
              ) : (
                <p className="tutor-user-text">{msg.content}</p>
              )}
              {msg.tokens && msg.tokPerSec && (
                <div className="tutor-stats">{msg.tokens} tokens · {msg.tokPerSec.toFixed(1)} tok/s</div>
              )}
            </div>
          </div>
        ))}

        {statusText && (
          <div className="tutor-status-indicator">
            <span className="tutor-status-dot" />
            {statusText}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Camera overlay ────────────────────────────────────────────────────── */}
      {cameraOpen && (
        <div className="tutor-camera-overlay">
          <div className="tutor-camera-frame" ref={videoMountRef} />
          <div className="tutor-camera-actions">
            <button className="tutor-cam-btn tutor-cam-cancel" onClick={closeCamera}>Cancel</button>
            <button className="tutor-cam-btn tutor-cam-snap" onClick={snapAndSend} disabled={!cameraReady}>
              {cameraReady ? 'Snap & Ask' : 'Starting…'}
            </button>
          </div>
        </div>
      )}

      {/* ── Input area ────────────────────────────────────────────────────────── */}
      <div className="tutor-input-wrapper">
        {/* Attachment preview strip */}
        {attachment && (
          <div className="tutor-attachment-strip">
            {attachment.preview
              ? <img src={attachment.preview} alt="preview" />
              : <div className="tutor-doc-chip"><FileIcon />{attachment.name}</div>
            }
            <button className="tutor-remove-attach" onClick={() => setAttachment(null)}><XIcon /></button>
          </div>
        )}

        <div className="tutor-input-row">
          {/* Tool buttons */}
          <div className="tutor-tool-btns">
            <button
              className={`tutor-tool-btn ${isRecording ? 'tutor-tool-active' : ''}`}
              onClick={toggleMic}
              title={isRecording ? 'Stop recording' : 'Voice input'}
            >
              <MicIcon active={isRecording} />
            </button>
            <button className="tutor-tool-btn" onClick={() => imageInputRef.current?.click()} title="Upload image">
              <ImageIcon />
            </button>
            <button className="tutor-tool-btn" onClick={openCamera} title="Take photo">
              <CameraIcon />
            </button>
            <button className="tutor-tool-btn" onClick={() => fileInputRef.current?.click()} title="Upload PDF or text file">
              <FileIcon />
            </button>
          </div>

          {/* Text input */}
          <textarea
            ref={inputRef}
            className="tutor-textarea"
            placeholder={isRecording ? 'Listening…' : 'Ask anything — type, upload, or use the mic…'}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={generating}
          />

          {/* Send / Stop */}
          {generating ? (
            <button className="tutor-send-btn tutor-stop-btn" onClick={() => cancelRef.current?.()}>
              <StopIcon />
            </button>
          ) : (
            <button
              className="tutor-send-btn"
              onClick={() => send()}
              disabled={!input.trim() && !attachment}
            >
              <SendIcon />
            </button>
          )}
        </div>
      </div>

      {/* Hidden file inputs */}
      <input ref={imageInputRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleImageFile(f); e.target.value = ''; }} />
      <input ref={fileInputRef} type="file" accept=".pdf,.txt,.md,.csv" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleDocFile(f); e.target.value = ''; }} />
    </div>
  );
}
