import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff } from 'lucide-react';
import './speech-recorder.css';
// UPDATED IMPORT - Using the AttioCRMProcessor from CRMConnector.js
import { AttioCRMProcessor } from './CRMConnector.js';

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
  const crmRef = useRef(null);

  const recognitionRef = useRef(null);
  const currentTextRef = useRef('');
  const fullTranscriptRef = useRef('');
  const triggeredRef = useRef(false);
  const crmCaptureRef = useRef('');

  const triggerPhrase = "initiate CRM";

  // Initialize the CRM Processor
  useEffect(() => {
    const initializeSystem = async () => {
      setProcessingStatus('Initializing CRM system...');
      try {
        // Replace with your actual Attio API token and Groq API key
        //const API_TOKEN = 'e01cca9d5d70d62535755e3f1609118082790728f8c98dbd0b3f9cce1aae3f53';
        const API_TOKEN = '4c1cd47f29e1e3f9e701251d68ee74d4a233f05013635d04988f812b9ea4664e';
        const GROQ_API_KEY = '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'; // You need to add your Groq API key
        
        const crmInstance = new AttioCRMProcessor(API_TOKEN, GROQ_API_KEY);
        await crmInstance.initializeSchema();
        crmRef.current = crmInstance;
        
        setProcessingStatus('✅ CRM system ready');
        setTimeout(() => setProcessingStatus(''), 3000);
      } catch (err) {
        setProcessingStatus('❌ System initialization failed');
        console.error('Initialization error:', err);
      }
    };
    initializeSystem();
  }, []);

  // UPDATED: Process conversation using processText method
  const processAdvancedCRM = async (text) => {
    setProcessingStatus('🧠 Analyzing conversation with AI...');

    try {
      const crm = crmRef.current;
      if (!crm) throw new Error("CRM not initialized");

      // Use the processText method from CRMConnector.js
      const results = await crm.processText(text);
      console.log('🎯 CRM Results:', results);

      // Extract results from the standard structure
      const successful = results.results?.filter(r => r.success) || [];
      const tasks = successful.filter(r => r.action?.includes('task'));
      
      // Update stats with the standard structure
      const dealUpdates = successful.filter(item => 
        item.object?.includes('deal') || 
        item.object?.includes('opportunity')
      );
      const personUpdates = successful.filter(item => 
        item.object?.includes('people') || 
        item.object?.includes('person') || 
        item.object?.includes('contact')
      );
      
      setStats(prevStats => ({
        dealsProcessed: prevStats.dealsProcessed + dealUpdates.length,
        contactsManaged: prevStats.contactsManaged + personUpdates.length,
        tasksCreated: prevStats.tasksCreated + tasks.length,
        totalValue: prevStats.totalValue // Would need to be calculated from actual deal values
      }));

      setLastAnalysis({
        timestamp: new Date().toISOString(),
        summary: generateAnalysisSummary(successful, tasks),
        updates: successful
      });

      setProcessingStatus(`✅ CRM updated: ${successful.length} records processed`);
      setTimeout(() => setProcessingStatus(''), 5000);

    } catch (error) {
      console.error('❌ CRM processing failed:', error);
      setProcessingStatus('❌ Processing failed - check console');
    }
  };

  // Generate summary from results
  const generateAnalysisSummary = (updates, tasks) => {
    const dealTypes = ['deal', 'opportunity'];
    const personTypes = ['people', 'person', 'contact'];
    
    const deals = updates.filter(item => 
      dealTypes.some(type => item.object?.includes(type))
    );
    const people = updates.filter(item => 
      personTypes.some(type => item.object?.includes(type))
    );
    
    let summary = [];
    
    if (deals.length > 0) {
      summary.push(`${deals.length} deal(s) processed`);
    }
    
    if (people.length > 0) {
      summary.push(`${people.length} contact(s) updated`);
    }
    
    if (tasks.length > 0) {
      summary.push(`${tasks.length} task(s) created`);
    }
    
    if (summary.length === 0) {
      summary.push('Records processed successfully');
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
        console.log('🔁 Processing CRM content:', finalText);
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
          console.log("✅ CRM trigger detected");
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
      
      {/* Status display */}
      {processingStatus && (
        <div className="processing-status" style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          background: 'rgba(0,0,0,0.8)',
          color: 'white',
          padding: '10px',
          borderRadius: '5px',
          fontSize: '12px',
          maxWidth: '300px'
        }}>
          {processingStatus}
        </div>
      )}
      
      {/* Stats display */}
      {stats.dealsProcessed > 0 && (
        <div className="stats-display" style={{
          position: 'fixed',
          bottom: '100px',
          left: '20px',
          background: 'rgba(0,0,0,0.8)',
          color: 'white',
          padding: '15px',
          borderRadius: '5px',
          fontSize: '14px'
        }}>
          <div>Deals: {stats.dealsProcessed}</div>
          <div>Contacts: {stats.contactsManaged}</div>
          <div>Tasks: {stats.tasksCreated}</div>
        </div>
      )}
    </div>
  );
};

export default AdvancedSpeechRecorder;