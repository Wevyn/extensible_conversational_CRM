"use client";
import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Settings, CheckCircle, AlertCircle, X } from 'lucide-react';
import { AttioCRMProcessor } from '@/lib/CRMConnector.js';

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

  // === OAuth Auth State (replaces manual API token UI) ===
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [savedToken, setSavedToken] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const oauthPopupRef = useRef(null);
  const oauthPollRef = useRef(null);

  const OAUTH_START_URL = '/integrations/attio/connect';

  // CRM / speech refs
  const crmRef = useRef(null);
  const recognitionRef = useRef(null);
  const currentTextRef = useRef('');
  const fullTranscriptRef = useRef('');
  const triggeredRef = useRef(false);
  const crmCaptureRef = useRef('');

  // NEW: stability helpers
  const shouldAutoRestartRef = useRef(false);
  const startRetryRef = useRef(null);
  const sessionIdRef = useRef(0);
  const isRecordingRef = useRef(false);

  const triggerPhrase = "initiate CRM";

  // Check for existing token on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('attio_api_token');
    if (storedToken) {
      setSavedToken(storedToken);
      setIsAuthenticated(true);
      initializeCRM(storedToken);
    }
  }, []);

  // Listen for the OAuth popup to send us the access token
  useEffect(() => {
    const handler = async (event) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data || {};
      if (data.type === 'ATTIO_OAUTH_SUCCESS' && typeof data.access_token === 'string') {
        if (oauthPopupRef.current && !oauthPopupRef.current.closed) {
          try { oauthPopupRef.current.close(); } catch {}
        }
        clearInterval(oauthPollRef.current);
        await validateAndSaveToken(data.access_token);
      } else if (data.type === 'ATTIO_OAUTH_ERROR' && data.message) {
        setIsConnecting(false);
        setProcessingStatus(`❌ ${data.message}`);
        setTimeout(() => setProcessingStatus(''), 4000);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const startOAuth = () => {
    setProcessingStatus('🔐 Opening Attio to connect your workspace...');
    setIsConnecting(true);
    const w = 520, h = 640;
    const y = window.top.outerHeight / 2 + window.top.screenY - (h / 2);
    const x = window.top.outerWidth / 2 + window.top.screenX - (w / 2);
    oauthPopupRef.current = window.open(
      OAUTH_START_URL,
      'attio_oauth',
      `width=${w},height=${h},left=${x},top=${y}`
    );
    clearInterval(oauthPollRef.current);
    oauthPollRef.current = setInterval(async () => {
      if (!oauthPopupRef.current || oauthPopupRef.current.closed) {
        clearInterval(oauthPollRef.current);
        setIsConnecting(false);
        return;
      }
      try {
        const res = await fetch('/integrations/attio/status', { credentials: 'include' });
        if (res.ok) {
          const json = await res.json();
          if (json && json.access_token) {
            oauthPopupRef.current.close();
            clearInterval(oauthPollRef.current);
            await validateAndSaveToken(json.access_token);
          }
        }
      } catch {
        // ignore polling errors
      }
    }, 1000);
  };

  const validateAndSaveToken = async (token) => {
    setProcessingStatus('🔍 Validating Attio access...');
    try {
      const resp = await fetch('https://api.attio.com/v2/objects', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      if (!resp.ok) throw new Error('Token validation failed');

      localStorage.setItem('attio_api_token', token);
      setSavedToken(token);
      setIsAuthenticated(true);
      setShowSetupModal(false);
      setProcessingStatus('✅ Connected to Attio!');

      await initializeCRM(token);
      setTimeout(() => setProcessingStatus(''), 3000);
      setIsConnecting(false);
    } catch (err) {
      console.error('Token validation error:', err);
      setIsConnecting(false);
      setProcessingStatus('❌ Could not validate token');
      setTimeout(() => setProcessingStatus(''), 4000);
    }
  };

  const handleDisconnect = () => {
    localStorage.removeItem('attio_api_token');
    setSavedToken('');
    setIsAuthenticated(false);
    crmRef.current = null;
    setProcessingStatus('🔌 Disconnected from Attio');
    setTimeout(() => setProcessingStatus(''), 2000);
  };

  const initializeCRM = async (token) => {
    setProcessingStatus('🔧 Initializing CRM system...');
    try {
      const GROQ_API_KEY = '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';
      const crmInstance = new AttioCRMProcessor(token, GROQ_API_KEY);
      await crmInstance.initializeSchema();
      crmRef.current = crmInstance;

      setProcessingStatus('✅ CRM system ready');
      setTimeout(() => setProcessingStatus(''), 3000);
    } catch (err) {
      setProcessingStatus('❌ CRM initialization failed');
      console.error('Initialization error:', err);
    }
  };

  // === Everything below here (processing/UX/recording) stays functionally the same ===
  const processAdvancedCRM = async (text) => {
    setProcessingStatus('🧠 Analyzing conversation with AI...');
    try {
      const crm = crmRef.current;
      if (!crm) throw new Error("CRM not initialized");

      const results = await crm.processText(text);
      console.log('🎯 CRM Results:', results);

      const successful = results.results?.filter(r => r.success) || [];
      const tasks = successful.filter(r => r.action?.includes('task'));

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
        totalValue: prevStats.totalValue
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

    if (deals.length > 0) summary.push(`${deals.length} deal(s) processed`);
    if (people.length > 0) summary.push(`${people.length} contact(s) updated`);
    if (tasks.length > 0) summary.push(`${tasks.length} task(s) created`);
    if (summary.length === 0) summary.push('Records processed successfully');

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

  // NEW: central builder + resilient starter
  const buildRecognition = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Speech recognition not supported.');
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';

    // bump session: ignore stale callbacks after rebuild
    const mySession = ++sessionIdRef.current;

    rec.onresult = (event) => {
      if (sessionIdRef.current !== mySession) return;
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
        } else if (triggeredRef.current) {
          crmCaptureRef.current += final + ' ';
        }
      }
    };

    rec.onerror = (e) => {
      if (sessionIdRef.current !== mySession) return;
      // Swallow benign errors that often occur after quick stop/start
      if (e.error === 'no-speech') {
        // No problem—just means the user was quiet.
        return;
      }
      if (e.error === 'aborted' || e.error === 'network' || e.error === 'audio-capture') {
        // Let onend handle recovery
        return;
      }
      console.error('Speech error:', e.error);
    };

    rec.onend = () => {
      if (sessionIdRef.current !== mySession) return;
      // Only auto-restart when we’re in “recording” mode
      if (shouldAutoRestartRef.current && isRecordingRef.current) {
        tryStart();
      }
    };

    recognitionRef.current = rec;
  };

  const tryStart = () => {
    if (!recognitionRef.current) buildRecognition();
    clearTimeout(startRetryRef.current);
    try {
      recognitionRef.current.start();
    } catch (err) {
      // Chrome can throw InvalidStateError if start() is called too soon after stop().
      startRetryRef.current = setTimeout(() => {
        try {
          recognitionRef.current && recognitionRef.current.start();
        } catch (e2) {
          // As a last resort, rebuild the recognizer once and start again.
          buildRecognition();
          try {
            recognitionRef.current && recognitionRef.current.start();
          } catch (e3) {
            console.error('Failed to start recognition:', e3);
          }
        }
      }, 250);
    }
  };

  const toggleRecording = async () => {
    if (!isAuthenticated) {
      setShowSetupModal(true);
      return;
    }

    if (!isRecording) {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        // Reset capture buffers every fresh session
        setIsRecording(true);
        isRecordingRef.current = true;
        setCurrentLines(['', '']);
        setPreviousLines(['', '']);
        currentTextRef.current = '';
        fullTranscriptRef.current = '';
        triggeredRef.current = false;
        crmCaptureRef.current = '';
        setProcessingStatus('');
        shouldAutoRestartRef.current = true;

        // (Re)build and start cleanly
        buildRecognition();
        tryStart();
      } catch (error) {
        alert('Microphone access denied.');
      }
    } else {
      // Stop recording cleanly and prevent auto-restart
      setIsRecording(false);
      isRecordingRef.current = false;
      shouldAutoRestartRef.current = false;

      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
        // A short abort ensures the engine fully releases between sessions
        setTimeout(() => {
          try { recognitionRef.current && recognitionRef.current.abort(); } catch {}
        }, 100);
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

  // Build recognizer once on mount; cleanup on unmount
  useEffect(() => {
    buildRecognition();
    return () => {
      clearTimeout(startRetryRef.current);
      try { recognitionRef.current && recognitionRef.current.abort(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ background: 'rgba(14, 14, 14, 0.8)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: 'white', fontFamily: "'Arial', sans-serif", position: 'relative' }}>
      {/* Setup Modal (replaced manual token with guided OAuth) */}
      {showSetupModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', padding: '30px', borderRadius: '15px', maxWidth: '520px', width: '90%', color: '#333', position: 'relative' }}>
            <button onClick={() => setShowSetupModal(false)} style={{ position: 'absolute', top: '15px', right: '15px', background: 'none', border: 'none', cursor: 'pointer', padding: '5px' }}>
              <X size={20} color="#666" />
            </button>

            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <Settings size={48} color="#007bff" style={{ marginBottom: '12px' }} />
              <h2 style={{ margin: '0 0 6px 0', color: '#333' }}>Connect your Attio workspace</h2>
              <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>
                Sign in, pick your workspace, and grant access. That’s it.
              </p>
            </div>

            {/* tiny guided flow like Cursor */}
            <ol style={{ margin: '0 0 16px 18px', color: '#444', lineHeight: 1.6, fontSize: '14px' }}>
              <li>Click <strong>Continue with Attio</strong>.</li>
              <li>Sign in to Attio (if prompted).</li>
              <li>Select the workspace and approve access.</li>
            </ol>

            <div style={{ background: '#f7f9fc', border: '1px solid #e8eef6', borderRadius: '10px', padding: '12px 14px', fontSize: '12px', color: '#556', marginBottom: '16px' }}>
              We’ll open a secure Attio window. When you finish, this page will auto-connect.
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
              <button onClick={() => setShowSetupModal(false)} style={{ background: '#6c757d', color: 'white', border: 'none', padding: '12px 20px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}>
                Cancel
              </button>
              <button onClick={startOAuth} disabled={isConnecting} style={{ background: isConnecting ? '#ccc' : '#007bff', color: 'white', border: 'none', padding: '12px 20px', borderRadius: '8px', cursor: isConnecting ? 'not-allowed' : 'pointer', fontSize: '14px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                {isConnecting ? 'Connecting…' : 'Continue with Attio'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auth Status Indicator */}
      <div style={{ position: 'fixed', top: '20px', left: '20px', background: isAuthenticated ? 'rgba(40, 167, 69, 0.9)' : 'rgba(220, 53, 69, 0.9)', color: 'white', padding: '8px 12px', borderRadius: '20px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', zIndex: 100, backdropFilter: 'blur(10px)' }}>
        {isAuthenticated ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
        {isAuthenticated ? 'Attio Connected' : 'Not Connected'}
        {isAuthenticated && (
          <button onClick={handleDisconnect} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', marginLeft: '8px', cursor: 'pointer', fontSize: '10px', padding: '2px 6px', borderRadius: '10px' }}>
            Disconnect
          </button>
        )}
      </div>

      {/* Settings Button */}
      <button onClick={() => setShowSetupModal(true)} style={{ position: 'fixed', top: '20px', right: '20px', background: 'rgba(0,0,0,0.7)', border: 'none', borderRadius: '50%', width: '45px', height: '45px', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', zIndex: 100, backdropFilter: 'blur(10px)', transition: 'all 0.3s ease' }}>
        <Settings size={20} color="white" />
      </button>

      {/* Lyric Display */}
      <div style={{ position: 'relative', width: '90%', maxWidth: '800px', height: '200px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', marginBottom: '50px', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', width: '100%', textAlign: 'center', transition: 'all 0.5s ease', transform: isAnimating ? 'translateY(-100px)' : 'translateY(0)', opacity: isAnimating ? 0 : 1 }}>
          <div style={{ fontSize: '2rem', fontWeight: 300, margin: '10px 0', textShadow: '2px 2px 4px rgba(0,0,0,0.3)', minHeight: '2.5rem' }}>{previousLines[0]}</div>
          <div style={{ fontSize: '2rem', fontWeight: 300, margin: '10px 0', textShadow: '2px 2px 4px rgba(0,0,0,0.3)', minHeight: '2.5rem' }}>{previousLines[1]}</div>
        </div>
        <div style={{ position: 'absolute', width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: 300, margin: '10px 0', textShadow: '2px 2px 4px rgba(0,0,0,0.3)', minHeight: '2.5rem' }}>{currentLines[0]}</div>
          <div style={{ fontSize: '2rem', fontWeight: 300, margin: '10px 0', textShadow: '2px 2px 4px rgba(0,0,0,0.3)', minHeight: '2.5rem' }}>{currentLines[1]}</div>
        </div>
      </div>

      {/* Mic Button */}
      <div style={{ position: 'relative', marginBottom: '30px' }}>
        {isRecording && (
          <>
            <div style={{ position: 'absolute', width: '120px', height: '120px', border: '2px solid rgba(255, 59, 48, 0.8)', borderRadius: '50%', animation: 'pulse 2s ease-out infinite', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
            <div style={{ position: 'absolute', width: '140px', height: '140px', border: '2px solid rgba(255, 59, 48, 0.8)', borderRadius: '50%', animation: 'pulse 2s ease-out infinite 1s', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
          </>
        )}
        <button onClick={toggleRecording} disabled={!isAuthenticated} style={{ position: 'relative', width: '100px', height: '100px', border: 'none', borderRadius: '50%', cursor: isAuthenticated ? 'pointer' : 'not-allowed', transition: 'all 0.3s ease', background: isRecording ? 'rgba(255, 59, 48, 0.2)' : isAuthenticated ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.05)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: isRecording ? '0 0 30px rgba(255, 59, 48, 0.3)' : 'none', opacity: !isAuthenticated ? 0.5 : 1, zIndex: 10 }}>
          <div style={{ color: 'white', zIndex: 10 }}>
            {isRecording ? <MicOff size={32} /> : <Mic size={32} />}
          </div>
        </button>
      </div>

      <div style={{ fontSize: '1.1rem', opacity: 0.8, textAlign: 'center' }}>
        {!isAuthenticated ? 'Connect to Attio to start recording' : isRecording ? 'Recording... say "initiate CRM" to start logging' : 'Click to start recording'}
      </div>

      {processingStatus && (
        <div style={{ position: 'fixed', top: '70px', right: '20px', background: 'rgba(0,0,0,0.8)', color: 'white', padding: '12px 16px', borderRadius: '10px', fontSize: '13px', maxWidth: '320px', zIndex: 90, backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)' }}>
          {processingStatus}
        </div>
      )}

      {stats.dealsProcessed > 0 && (
        <div style={{ position: 'fixed', bottom: '20px', left: '20px', background: 'rgba(0,0,0,0.8)', color: 'white', padding: '15px', borderRadius: '10px', fontSize: '14px', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <div>📊 Deals: {stats.dealsProcessed}</div>
          <div>👥 Contacts: {stats.contactsManaged}</div>
          <div>✅ Tasks: {stats.tasksCreated}</div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0% { transform: translate(-50%, -50%) scale(0.8); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(1.2); opacity: 0; }
        }
      `}</style>
    </div>
  );
};

export default AdvancedSpeechRecorder;
