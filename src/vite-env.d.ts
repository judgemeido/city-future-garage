/// <reference types="vite/client" />

interface Window {
  garageDesktop?: {
    saveFile(filename: string, bytes: ArrayBuffer): Promise<{ saved: boolean }>;
    printPDF(): Promise<void>;
  };
}
