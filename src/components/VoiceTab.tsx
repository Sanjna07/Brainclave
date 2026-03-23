import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { VoicePipeline, ModelCategory, ModelManager, AudioCapture, AudioPlayback, SpeechActivity } from '@runanywhere/web';
import { useMemory } from '../hooks/useMemory';
import { VAD } from '@runanywhere/web-onnx';
import { useModelLoader } from '../hooks/useModelLoader';
import { ModelBanner } from './ModelBanner';

type VoiceState = 'idle' | 'loading-models' | 'listening' | 'processing' | 'speaking';

export function VoiceTab() {
  const llmLoader = useModelLoader(ModelCategory.Language, undefined, true);
  const sttLoader = useModelLoader(ModelCategory.SpeechRecognition, undefined, true);
  const ttsLoader = useModelLoader(ModelCategory.SpeechSynthesis, undefined, true);
  const vadLoader = useModelLoader(ModelCategory.Audio, undefined, true);

  const memory = useMemory();

  const systemPrompt = useMemo(() => {
    const subs = memory.subjects.map(s => s.name).join(', ');
    const weaks = memory.weakTopics.map(w => w.topic).join(', ');
    const tasks = memory.tasks.filter(t => t.status === 'pending').map(t => t.title).join(', ');
    
    return `You are a personalized intelligent teacher for Brainclave, not just a chatbot.
You have access to the student's learning profile:
- Subjects: ${subs || 'None yet'}
- Weak Topics: ${weaks || 'None currently'}
- Pending Tasks: ${tasks || 'None currently'}

Guidelines:
- Act as an intelligent study companion.
- Use Socratic questioning to guide the user. Give hints, conceptual nudges, and step-by-step thinking approaches instead of direct answers.
- Keep responses concise (1-3 sentences) optimized for voice conversation.
- Speak clearly and professionally.`;
  }, [memory.subjects, memory.weakTopics, memory.tasks]);

  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const micRef = useRef<AudioCapture | null>(null);
  const pipelineRef = useRef<VoicePipeline | null>(null);
  const vadUnsub = useRef<(() => void) | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      micRef.current?.stop();
      vadUnsub.current?.();
    };
  }, []);

  // Ensure all 4 models are loaded
  const ensureModels = useCallback(async (): Promise<boolean> => {
    setVoiceState('loading-models');
    setError(null);

    const results = await Promise.all([
      vadLoader.ensure(),
      sttLoader.ensure(),
      llmLoader.ensure(),
      ttsLoader.ensure(),
    ]);

    if (results.every(Boolean)) {
      setVoiceState('idle');
      return true;
    }

    setError('Failed to load one or more voice models');
    setVoiceState('idle');
    return false;
  }, [vadLoader, sttLoader, llmLoader, ttsLoader]);

  // Process a speech segment through the full pipeline
  const processSpeech = useCallback(async (audioData: Float32Array) => {
    const pipeline = pipelineRef.current;
    if (!pipeline) return;

    // Stop mic during processing
    micRef.current?.stop();
    vadUnsub.current?.();
    setVoiceState('processing');

    try {
      const result = await pipeline.processTurn(audioData, {
        maxTokens: 60,
        temperature: 0.7,
        systemPrompt: systemPrompt,
      }, {
        onTranscription: (text) => {
          setTranscript(text);
        },
        onResponseToken: (_token, accumulated) => {
          setResponse(accumulated);
        },
        onResponseComplete: (text) => {
          setResponse(text);
        },
        onSynthesisComplete: async (audio, sampleRate) => {
          setVoiceState('speaking');
          const player = new AudioPlayback({ sampleRate });
          await player.play(audio, sampleRate);
          player.dispose();
        },
        onStateChange: (s) => {
          if (s === 'processingSTT') setVoiceState('processing');
          if (s === 'generatingResponse') setVoiceState('processing');
          if (s === 'playingTTS') setVoiceState('speaking');
        },
      });

      if (result) {
        setTranscript(result.transcription);
        setResponse(result.response);
        await memory.addHistory('voice', 'user', result.transcription);
        await memory.addHistory('voice', 'assistant', result.response);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }

    setVoiceState('idle');
    setAudioLevel(0);
  }, [systemPrompt, memory]);

  // Start listening
  const startListening = useCallback(async () => {
    setTranscript('');
    setResponse('');
    setError(null);

    // Load models if needed
    const anyMissing = !ModelManager.getLoadedModel(ModelCategory.Audio)
      || !ModelManager.getLoadedModel(ModelCategory.SpeechRecognition)
      || !ModelManager.getLoadedModel(ModelCategory.Language)
      || !ModelManager.getLoadedModel(ModelCategory.SpeechSynthesis);

    if (anyMissing) {
      const ok = await ensureModels();
      if (!ok) return;
    }

    setVoiceState('listening');

    const mic = new AudioCapture({ sampleRate: 16000 });
    micRef.current = mic;

    if (!pipelineRef.current) {
      pipelineRef.current = new VoicePipeline();
    }

    // Start VAD + mic
    VAD.reset();

    vadUnsub.current = VAD.onSpeechActivity((activity) => {
      if (activity === SpeechActivity.Ended) {
        const segment = VAD.popSpeechSegment();
        if (segment && segment.samples.length > 1600) {
          processSpeech(segment.samples);
        }
      }
    });

    await mic.start(
      (chunk) => { VAD.processSamples(chunk); },
      (level) => { setAudioLevel(level); },
    );
  }, [ensureModels, processSpeech]);

  const stopListening = useCallback(() => {
    micRef.current?.stop();
    vadUnsub.current?.();
    setVoiceState('idle');
    setAudioLevel(0);
  }, []);

  // Which loaders are still loading?
  const pendingLoaders = [
    { label: 'VAD', loader: vadLoader },
    { label: 'STT', loader: sttLoader },
    { label: 'LLM', loader: llmLoader },
    { label: 'TTS', loader: ttsLoader },
  ].filter((l) => l.loader.state !== 'ready');

  return (
    <div className="tab-panel voice-panel">
      {pendingLoaders.length > 0 && voiceState === 'idle' && (
        <ModelBanner
          state={pendingLoaders[0].loader.state}
          progress={pendingLoaders[0].loader.progress}
          error={pendingLoaders[0].loader.error}
          onLoad={ensureModels}
          label={`Voice (${pendingLoaders.map((l) => l.label).join(', ')})`}
        />
      )}

      {error && <div className="model-banner"><span className="error-text">{error}</span></div>}

      <div className="voice-center">
        <div className="voice-orb" data-state={voiceState} style={{ '--level': audioLevel } as React.CSSProperties}>
          <div className="voice-orb-inner" />
        </div>

        <p className="voice-status">
          {voiceState === 'idle' && 'Tap to start listening'}
          {voiceState === 'loading-models' && 'Loading models...'}
          {voiceState === 'listening' && 'Listening... speak now'}
          {voiceState === 'processing' && 'Processing...'}
          {voiceState === 'speaking' && 'Speaking...'}
        </p>

        {voiceState === 'idle' || voiceState === 'loading-models' ? (
          <button
            className="btn btn-primary btn-lg"
            onClick={startListening}
            disabled={voiceState === 'loading-models'}
          >
            Start Listening
          </button>
        ) : voiceState === 'listening' ? (
          <button className="btn btn-lg" onClick={stopListening}>
            Stop
          </button>
        ) : null}
      </div>

      {transcript && (
        <div className="voice-transcript">
          <h4>You said:</h4>
          <p>{transcript}</p>
        </div>
      )}

      {response && (
        <div className="voice-response">
          <h4>AI response:</h4>
          <p>{response}</p>
        </div>
      )}
    </div>
  );
}
