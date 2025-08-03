import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff } from 'lucide-react';
import './speech-recorder.css';
import { sendToAttio, initializeAttributeIds } from './advanced-attio.js';
import { sendToAdvancedDeepSeek, ConversationContext } from './advanced-parser.js';

const AdvancedSpeechRecorder = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [currentLines, setCurrentLines] = useState(['', '']);
  const [previousLines, setPreviousLines] = useState(['', '']);
  const [isAnimating, setIsAnimating] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [lastAnalysis, setLastAnalysis] = useState(null);
  const [stats, setStats] = useState({
    dealsProcessed: 0,
    contactsManaged: 0,
    tasksCreated: 0,
    totalValue: 0
  });

  const recognitionRef = useRef(null);
  const currentTextRef = useRef('');
  const fullTranscriptRef = useRef('');
  const triggeredRef = useRef(false);
  const crmCaptureRef = useRef('');
  const conversationContextRef = useRef(new ConversationContext());

  const triggerPhrase = "initiate CRM";

  // Initialize the advanced system
  useEffect(() => {
    const initializeSystem = async () => {
      setProcessingStatus('Initializing advanced CRM system...');
      try {
        await initializeAttributeIds();
        setProcessingStatus('✅ Advanced CRM system ready');
        setTimeout(() => setProcessingStatus(''), 3000);
      } catch (err) {
        setProcessingStatus('❌ System initialization failed');
        console.error('Initialization error:', err);
      }
    };
    
    initializeSystem();
  }, []);

  const processAdvancedCRM = async (text) => {
    setProcessingStatus('🧠 Analyzing conversation with AI...');
    
    try {
      // Get conversation context
      const context = conversationContextRef.current.getContext();
      
      // Send to advanced AI parser
      const updates = await sendToAdvancedDeepSeek(text, context);
      console.log('🎯 Advanced AI extracted:', updates);
      
      if (updates.length === 0) {
        setProcessingStatus('ℹ️ No actionable data found');
        return;
      }

      setProcessingStatus('💾 Updating Attio CRM...');
      
      // Send to Attio
      await sendToAttio(updates);
      
      // Update conversation context
      conversationContextRef.current.updateContext(updates);
      
      // Update stats and analysis
      const dealUpdates = updates.filter(item => item.type === 'deal');
      const personUpdates = updates.filter(item => item.type === 'person');
      const taskUpdates = updates.filter(item => item.type === 'task');
      
      const totalValue = dealUpdates.reduce((sum, deal) => sum + (deal.value || 0), 0);
      
      setStats(prevStats => ({
        dealsProcessed: prevStats.dealsProcessed + dealUpdates.length,
        contactsManaged: prevStats.contactsManaged + personUpdates.length,
        tasksCreated: prevStats.tasksCreated + taskUpdates.length,
        totalValue: prevStats.totalValue + totalValue
      }));
      
      setLastAnalysis({
        timestamp: new Date().toISOString(),
        summary: generateAnalysisSummary(updates),
        updates: updates
      });
      
      setProcessingStatus('✅ CRM updated successfully');
      setTimeout(() => setProcessingStatus(''), 5000);
      
    } catch (error) {
      console.error('❌ Advanced CRM processing failed:', error);
      setProcessingStatus('❌ Processing failed - check console');
    }
  };

  const generateAnalysisSummary = (updates) => {
    const deals = updates.filter(item => item.type === 'deal');
    const people = updates.filter(item => item.type === 'person');
    const tasks = updates.filter(item => item.type === 'task');
    const relationships = updates.filter(item => item.type === 'relationship');
    
    let summary = [];
    
    if (deals.length > 0) {
      const totalValue = deals.reduce((sum, deal) => sum + (deal.value || 0), 0);
      summary.push(`${deals.length} deal(s) worth $${totalValue.toLocaleString()}`);
    }
    
    if (people.length > 0) {
      const sentiments = people.map(p => p.sentiment).filter(Boolean);
      const positiveSentiment = sentiments.filter(s => s === 'positive').length;
      summary.push(`${people.length} contact(s), ${positiveSentiment} positive`);
    }
    
    if (tasks.length > 0) {
      const highPriority = tasks.filter(t => t.priority === 'high').length;
      summary.push(`${tasks.length} task(s), ${highPriority} high priority`);
    }
    
    if (relationships.length > 0) {
      summary.push(`${relationships.length} relationship update(s)`);
    }
    
    return summary.join(' • ');
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
        setProcessingStatus('');
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
      if (finalText.length > 10) {
        console.log('🔁 Processing advanced CRM content:', finalText);
        await processAdvancedCRM(finalText);
      } else {
        setProcessingStatus('ℹ️ No substantial CRM content captured');
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
          console.log("✅ Advanced CRM trigger detected");
          triggeredRef.current = true;
          crmCaptureRef.current = '';
          setProcessingStatus('🎯 CRM mode activated - listening for business intelligence...');
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

export default AdvancedSpeechRecorder;