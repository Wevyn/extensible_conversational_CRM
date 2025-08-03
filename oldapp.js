import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff } from 'lucide-react';
import './speech-recorder.css';
import { sendToAttio } from './attio'; // Updated Attio integration

const SpeechRecorder = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [currentLines, setCurrentLines] = useState(['', '']);
  const [previousLines, setPreviousLines] = useState(['', '']);
  const [isAnimating, setIsAnimating] = useState(false);
  const recognitionRef = useRef(null);
  const currentTextRef = useRef('');
  const fullTranscriptRef = useRef('');
  const triggeredRef = useRef(false);
  const crmCaptureRef = useRef('');

  const triggerPhrase = "initiate CRM";

  const sendToDeepSeek = async (text) => {
    const prompt = `
You are a Attio CRM enrichment assistant. Your job is to extract structured updates from sales conversations.

Return a **strictly valid** JSON array. Use only double quotes ("") around keys and string values.
Each object must include a "type" field ("person", "task", etc).
Ensure all date/time values are ISO 8601 strings (e.g. "2025-08-06T15:00:00Z").
Transcript:
"""
${text}
"""
`;

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer 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',
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'Attio CRM Parser'
        },
        body: JSON.stringify({
          model: 'deepseek/deepseek-r1:free',
          messages: [
            {
              role: 'system',
              content: 'You are a helpful assistant that extracts structured CRM updates from transcripts.'
            },
            {
              role: 'user',
              content: prompt
            }
          ]
        })
      });

      const data = await response.json();
      const raw = data.choices?.[0]?.message?.content;
      if (!raw) return [];

      const cleaned = raw.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned);

      // Fallbacks to prevent errors
      parsed.forEach(item => {
        if (item.type === 'task') {
          item.linked_records = item.linked_records || [];
          item.assignees = item.assignees || [];
          item.description = item.description || item.name || '';
          item.due_date = item.due_date || new Date().toISOString();
        }
        if (item.type === 'person') {
          item.notes = item.notes || '';
        }
        if (item.type === 'task' && !item.link_to_person_name && parsed.some(p => p.type === 'person')) {
          item.link_to_person_name = parsed.find(p => p.type === 'person')?.name;
        }

      });

      return parsed;

    } catch (err) {
      console.warn('❌ Failed to parse DeepSeek response:', err);
      return [];
    }
  };

  const updateLyricDisplay = (text) => {
    const words = text.split(' ');
    const wordsPerLine = 8;
    if (words.length > wordsPerLine * 2) {
      if (!isAnimating) {
        setIsAnimating(true);
        setPreviousLines([currentLines[0], currentLines[1]]);
        const newLine1 = words.slice(-wordsPerLine * 2, -wordsPerLine).join(' ');
        const newLine2 = words.slice(-wordsPerLine).join(' ');
        setTimeout(() => {
          setCurrentLines([newLine1, newLine2]);
          setTimeout(() => {
            setIsAnimating(false);
            setTimeout(() => {
              setPreviousLines(['', '']);
            }, 500);
          }, 100);
        }, 50);
        currentTextRef.current = newLine1 + ' ' + newLine2 + ' ';
      }
    } else {
      const line1 = words.slice(0, wordsPerLine).join(' ');
      const line2 = words.slice(wordsPerLine).join(' ');
      setCurrentLines([line1, line2]);
    }
  };

  const toggleRecording = async () => {
    if (!isRecording) {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        recognitionRef.current.start();
        setIsRecording(true);
        setCurrentLines(['', '']);
        setPreviousLines(['', '']);
        currentTextRef.current = '';
        fullTranscriptRef.current = '';
        triggeredRef.current = false;
        crmCaptureRef.current = '';
      } catch (error) {
        alert('Microphone access denied.');
      }
    } else {
      setIsRecording(false);
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      }

      const finalText = crmCaptureRef.current.trim();
      if (finalText.length > 5) {
        console.log('🔁 Sending CRM content to DeepSeek:', finalText);
        const updates = await sendToDeepSeek(finalText);
        console.log('📤 Parsed updates:', updates);
        await sendToAttio(updates);
      } else {
        console.log('ℹ️ No CRM content captured.');
      }
    }
  };

  useEffect(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Speech recognition not supported.');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.continuous = true;
    recognitionRef.current.interimResults = true;
    recognitionRef.current.lang = 'en-US';

    recognitionRef.current.onresult = (event) => {
      let interim = '', final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript + ' ';
        } else {
          interim += transcript;
        }
      }

      const fullText = currentTextRef.current + final + interim;
      updateLyricDisplay(fullText);

      if (final) {
        currentTextRef.current += final;
        fullTranscriptRef.current += final + ' ';

        const clean = final.toLowerCase().trim();
        if (!triggeredRef.current && clean.includes(triggerPhrase.toLowerCase())) {
          console.log("✅ Trigger phrase detected");
          triggeredRef.current = true;
          crmCaptureRef.current = '';
        }
        else if (triggeredRef.current) {
          crmCaptureRef.current += final + ' ';
        }
      }
    };

    recognitionRef.current.onerror = (e) => console.error('Speech error:', e.error);
    recognitionRef.current.onend = () => {
      if (isRecording) recognitionRef.current.start();
    };

    return () => recognitionRef.current?.stop();
  }, [isRecording]);

  return (
    <div className="speech-recorder">
      <div className="lyric-display">
        <div className={`previous-lines ${isAnimating ? 'animating' : ''}`}>
          <div className="lyric-line">{previousLines[0]}</div>
          <div className="lyric-line">{previousLines[1]}</div>
        </div>
        <div className="current-lines">
          <div className="lyric-line">{currentLines[0]}</div>
          <div className="lyric-line">{currentLines[1]}</div>
        </div>
        <div className="gradient-overlay" />
      </div>
      <button onClick={toggleRecording} className={`mic-button ${isRecording ? 'recording' : 'idle'}`}>
        {isRecording && <>
          <div className="pulse-ring pulse-ping"></div>
          <div className="pulse-ring pulse-beat"></div>
        </>}
        <div className="mic-icon">{isRecording ? <MicOff size={32} /> : <Mic size={32} />}</div>
      </button>
      <div className="status-text">
        {isRecording ? 'Recording... say "initiate CRM" to start logging' : 'Click to start recording'}
      </div>
    </div>
  );
};

export default SpeechRecorder;