import { useState, useRef, useCallback, useEffect } from 'react';
import { getAuthHeaders } from './useAuth';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8888';

// Module-level: only one audio can play at a time
let globalAudio: HTMLAudioElement | null = null;
let globalStopCallback: (() => void) | null = null;

type TTSState = 'idle' | 'loading' | 'playing';

export function useTTS(_messageId: string, text: string) {
  const [state, setState] = useState<TTSState>('idle');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      // If this was the global player, clear it
      if (globalAudio === audioRef.current) {
        globalAudio = null;
        globalStopCallback = null;
      }
    };
  }, []);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setState('idle');
  }, []);

  const toggle = useCallback(async () => {
    // If currently playing, pause
    if (state === 'playing') {
      stop();
      return;
    }

    // If loading, ignore
    if (state === 'loading') return;

    // Stop any other playing audio
    if (globalAudio && globalStopCallback) {
      globalStopCallback();
    }

    // If we already have the audio blob, just replay
    if (audioRef.current && blobUrlRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play();
      setState('playing');
      globalAudio = audioRef.current;
      globalStopCallback = stop;
      return;
    }

    // Fetch audio from TTS API
    setState('loading');
    try {
      const resp = await fetch(`${API_BASE_URL}/api/agent/tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        credentials: 'include',
        body: JSON.stringify({ text }),
      });

      if (!resp.ok) {
        throw new Error(`TTS failed: ${resp.status}`);
      }

      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;

      const audio = new Audio(url);
      audioRef.current = audio;
      globalAudio = audio;
      globalStopCallback = stop;

      audio.addEventListener('ended', () => {
        setState('idle');
        globalAudio = null;
        globalStopCallback = null;
      });

      audio.addEventListener('error', () => {
        setState('idle');
        globalAudio = null;
        globalStopCallback = null;
      });

      await audio.play();
      setState('playing');
    } catch (err) {
      console.error('TTS error:', err);
      setState('idle');
    }
  }, [state, text, stop]);

  return { state, toggle };
}
