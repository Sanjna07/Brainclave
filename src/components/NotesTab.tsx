import { useState } from 'react';
import { ModelCategory } from '@runanywhere/web';
import { TextGeneration } from '@runanywhere/web-llamacpp';
import { useModelLoader } from '../hooks/useModelLoader';
import { ModelBanner } from './ModelBanner';
import { useMemory } from '../hooks/useMemory';
import { FileText, Wand2, CheckCircle, Loader2 } from './Icons';

export function NotesTab() {
  const loader = useModelLoader(ModelCategory.Language);
  const memory = useMemory();
  const [input, setInput] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [generating, setGenerating] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [success, setSuccess] = useState(false);

  const handleGenerate = async () => {
    const text = input.trim();
    if (!text || !subjectId || generating) return;

    if (loader.state !== 'ready') {
      const ok = await loader.ensure();
      if (!ok) return;
    }

    setGenerating(true);
    setSuccess(false);
    setStatusMsg('Analyzing lecture material...');

    const prompt = `You are an expert study guide generator. Convert the following lecture material into a summary and flashcards.
Use EXACTLY this format, do not add any other sections or markdown formatting.

SUMMARY:
(write a concise bulleted summary)

FLASHCARDS:
Q: (first question)
A: (first answer)
Q: (second question)
A: (second answer)

LECTURE MATERIAL:
${text}
`;

    try {
      setStatusMsg('Generating structured notes and flashcards...');
      
      const { stream, result: resultPromise } = await TextGeneration.generateStream(prompt, {
        maxTokens: 1024,
        temperature: 0.3,
      });

      let accumulated = '';
      for await (const token of stream) {
        accumulated += token;
      }

      const result = await resultPromise;
      const outputText = result.text || accumulated;

      // Naive parser
      const summaryMatch = outputText.match(/SUMMARY:([\s\S]*?)FLASHCARDS:/i);
      const flashcardsSection = outputText.match(/FLASHCARDS:([\s\S]*)/i);

      let summary = summaryMatch ? summaryMatch[1].trim() : 'Could not extract summary.';
      let flashcardsExtracted: { q: string; a: string }[] = [];

      if (flashcardsSection) {
        const fcText = flashcardsSection[1].trim();
        const lines = fcText.split('\n').filter(l => l.trim() !== '');
        
        let currentQ = '';
        let currentA = '';
        
        for (const line of lines) {
          if (line.toUpperCase().startsWith('Q:')) {
            if (currentQ && currentA) {
              flashcardsExtracted.push({ q: currentQ, a: currentA });
              currentA = '';
            }
            currentQ = line.substring(2).trim();
          } else if (line.toUpperCase().startsWith('A:')) {
            currentA = line.substring(2).trim();
          } else {
             // Append to answer if it's a multi-line answer
             if (currentQ && !currentA) currentA = line.trim();
             else if (currentQ && currentA) currentA += ' ' + line.trim();
          }
        }
        if (currentQ && currentA) {
          flashcardsExtracted.push({ q: currentQ, a: currentA });
        }
      }

      // If parsing totally failed, fallback:
      if (!summaryMatch && !flashcardsSection) {
        summary = outputText.trim();
      }

      setStatusMsg('Saving to memory...');
      
      const title = text.split(' ').slice(0, 5).join(' ') + '... Notes';
      
      // Save Note
      await memory.addNote(subjectId, title, summary, 'summary');
      
      // Save Flashcards
      for (const fc of flashcardsExtracted) {
        const { addFlashcard } = await import('../lib/memory');
        await addFlashcard(subjectId, fc.q, fc.a);
      }

      setInput('');
      setSuccess(true);
      setStatusMsg(`Successfully created 1 Summary and ${flashcardsExtracted.length} Flashcard(s).`);
      
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMsg(`Error: ${msg}`);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="tab-panel chat-panel" style={{ padding: '24px', overflowY: 'auto' }}>
      <ModelBanner
        state={loader.state}
        progress={loader.progress}
        error={loader.error}
        onLoad={loader.ensure}
        label="LLM Notes Processor"
      />

      <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <h2><FileText size={24} style={{ verticalAlign: 'middle', marginRight: '8px' }} /> Smart Notes Converter</h2>
        <p style={{ color: 'var(--text-muted)' }}>
          Paste your lecture content, transcripts, or study material here. Our AI will automatically synthesize it into a structured summary and active-recall flashcards, then organize them into your selected Subject Memory.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <label style={{ fontWeight: 600 }}>Select Subject</label>
          <select 
            className="memory-input" 
            value={subjectId} 
            onChange={e => setSubjectId(e.target.value)}
          >
            <option value="">-- Choose a subject --</option>
            {memory.subjects.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          {memory.subjects.length === 0 && (
            <small style={{ color: 'var(--text-muted)' }}>You need to create a Subject in the History tab first!</small>
          )}

          <label style={{ fontWeight: 600 }}>Lecture Content</label>
          <textarea
            className="memory-input"
            style={{ minHeight: '300px', resize: 'vertical' }}
            placeholder="Paste your lecture transcript or notes here..."
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={generating}
          ></textarea>

          <button 
            className="btn btn-primary" 
            style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '8px' }}
            onClick={handleGenerate}
            disabled={!input.trim() || !subjectId || generating}
          >
            {generating ? <Loader2 size={18} className="spinner" /> : <Wand2 size={18} />}
            {generating ? 'Processing...' : 'Convert to Learning Materials'}
          </button>
        </div>

        {statusMsg && (
          <div style={{ 
            padding: '16px', 
            borderRadius: '8px', 
            backgroundColor: success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255, 255, 255, 0.05)',
            border: success ? '1px solid #10B981' : '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            {success ? <CheckCircle size={24} color="#10B981" /> : generating ? <Loader2 size={24} className="spinner" /> : null}
            <span style={{ color: success ? '#10B981' : 'var(--text)' }}>{statusMsg}</span>
          </div>
        )}
      </div>
    </div>
  );
}
