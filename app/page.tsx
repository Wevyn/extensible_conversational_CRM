"use client";
import React, { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";

export default function HomePage() {
  const [isRecording, setIsRecording] = useState(false);
  const [currentLines, setCurrentLines] = useState<string[]>(["", ""]);
  const [previousLines, setPreviousLines] = useState<string[]>(["", ""]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [status, setStatus] = useState("");
  const recognitionRef = useRef<any>(null);
  const currentTextRef = useRef("");
  const crmCaptureRef = useRef("");
  const triggeredRef = useRef(false);
  const triggerPhrase = "initiate CRM";

  const updateLyricDisplay = (text: string) => {
    const words = text.split(" ");
    const wordsPerLine = 8;
    if (words.length > wordsPerLine * 2) {
      if (!isAnimating) {
        setIsAnimating(true);
        setPreviousLines([currentLines[0], currentLines[1]]);
        const newLine1 = words
          .slice(-wordsPerLine * 2, -wordsPerLine)
          .join(" ");
        const newLine2 = words.slice(-wordsPerLine).join(" ");
        setTimeout(() => {
          setCurrentLines([newLine1, newLine2]);
          setTimeout(() => {
            setIsAnimating(false);
            setTimeout(() => {
              setPreviousLines(["", ""]);
            }, 500);
          }, 100);
        }, 50);
        currentTextRef.current = newLine1 + " " + newLine2 + " ";
      }
    } else {
      const line1 = words.slice(0, wordsPerLine).join(" ");
      const line2 = words.slice(wordsPerLine).join(" ");
      setCurrentLines([line1, line2]);
    }
  };

  const processCRM = async (text: string) => {
    try {
      setStatus("Analyzing...");
      const parseRes = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const updates = await parseRes.json();
      setStatus("Syncing to Attio...");
      const attioRes = await fetch("/api/attio/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      if (!attioRes.ok) throw new Error("Attio sync failed");
      setStatus("Done");
      setTimeout(() => setStatus(""), 3000);
    } catch (e: any) {
      setStatus("Error, check console");
      console.error(e);
    }
  };

  const toggleRecording = async () => {
    if (!isRecording) {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        recognitionRef.current.start();
        setIsRecording(true);
        setCurrentLines(["", ""]);
        setPreviousLines(["", ""]);
        currentTextRef.current = "";
        crmCaptureRef.current = "";
        setStatus("");
      } catch {
        alert("Microphone access denied.");
      }
    } else {
      setIsRecording(false);
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      }
      const finalText = crmCaptureRef.current.trim();
      if (finalText.length > 10) {
        await processCRM(finalText);
      } else {
        setStatus("No substantial CRM content captured");
      }
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition not supported.");
      return;
    }
    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.continuous = true;
    recognitionRef.current.interimResults = true;
    recognitionRef.current.lang = "en-US";

    recognitionRef.current.onresult = (event: any) => {
      let interim = "",
        final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += transcript + " ";
        else interim += transcript;
      }
      const fullText = currentTextRef.current + final + interim;
      updateLyricDisplay(fullText);
      if (final) {
        currentTextRef.current += final;
        const clean = final.toLowerCase().trim();
        if (
          !triggeredRef.current &&
          clean.includes(triggerPhrase.toLowerCase())
        ) {
          triggeredRef.current = true;
          crmCaptureRef.current = "";
          setStatus("CRM mode on");
        } else if (triggeredRef.current) {
          crmCaptureRef.current += final + " ";
        }
      }
    };
    recognitionRef.current.onerror = (e: any) =>
      console.error("Speech error:", e.error);
    recognitionRef.current.onend = () => {
      if (isRecording) recognitionRef.current.start();
    };
    return () => recognitionRef.current?.stop();
  }, [isRecording]);

  return (
    <div className="speech-recorder">
      <div className="lyric-display">
        <div className={`previous-lines ${isAnimating ? "animating" : ""}`}>
          <div className="lyric-line">{previousLines[0]}</div>
          <div className="lyric-line">{previousLines[1]}</div>
        </div>
        <div className="current-lines">
          <div className="lyric-line">{currentLines[0]}</div>
          <div className="lyric-line">{currentLines[1]}</div>
        </div>
        <div className="gradient-overlay" />
      </div>
      <button
        onClick={toggleRecording}
        className={`mic-button ${isRecording ? "recording" : "idle"}`}
      >
        {isRecording && (
          <>
            <div className="pulse-ring pulse-ping" />
            <div className="pulse-ring pulse-beat" />
          </>
        )}
        <div className="mic-icon">
          {isRecording ? <MicOff size={32} /> : <Mic size={32} />}
        </div>
      </button>
      <div className="status-text">
        {status ||
          (isRecording
            ? 'Recording... say "initiate CRM"'
            : "Click to start recording")}
      </div>
    </div>
  );
}
