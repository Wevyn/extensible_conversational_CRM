import React from "react";
import { render, screen } from "@testing-library/react";
import HomePage from "./page";

describe("HomePage", () => {
  beforeEach(() => {
    // Minimal stubs for browser APIs used by the component without replacing window
    // alert
    (globalThis as any).alert = vi.fn();

    // navigator.mediaDevices.getUserMedia
    Object.defineProperty(globalThis.navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({}),
      },
    });

    // SpeechRecognition constructors
    function MockRecognition(this: any) {
      this.continuous = true;
      this.interimResults = true;
      this.lang = "en-US";
      this.start = vi.fn();
      this.stop = vi.fn();
    }

    Object.defineProperty(window as any, "SpeechRecognition", {
      configurable: true,
      value: MockRecognition,
    });
    Object.defineProperty(window as any, "webkitSpeechRecognition", {
      configurable: true,
      value: MockRecognition,
    });
  });

  it("renders without crashing and shows idle text", () => {
    render(<HomePage />);
    expect(screen.getByText(/Click to start recording/i)).toBeInTheDocument();
  });
});
