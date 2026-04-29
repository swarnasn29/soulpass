'use client';

import { useEffect, useRef, useState } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Camera } from 'lucide-react';

export default function QRScanner({ isOpen, onClose, onScan }: { isOpen: boolean, onClose: () => void, onScan: (data: string) => void }) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const scanner = new Html5QrcodeScanner(
      'qr-reader',
      { fps: 10, qrbox: { width: 250, height: 250 } },
      /* verbose= */ false
    );

    scanner.render(
      (data) => {
        onScan(data);
        scanner.clear();
        onClose();
      },
      (err) => {
        // We don't want to spam errors in the UI for every frame it doesn't see a QR
        // console.warn(err);
      }
    );

    return () => {
      scanner.clear().catch(err => console.error("Failed to clear scanner", err));
    };
  }, [isOpen, onScan, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl"
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            className="relative w-full max-w-md p-8 bg-[#1A1A1A] border border-white/10 rounded-[3rem] overflow-hidden"
          >
            <button 
              onClick={onClose}
              className="absolute top-6 right-6 p-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>

            <div className="text-center mb-8">
              <div className="inline-flex p-4 bg-purple-500/20 rounded-3xl mb-4">
                <Camera className="w-8 h-8 text-purple-400" />
              </div>
              <h2 className="text-2xl font-black">Scan QR Code</h2>
              <p className="text-gray-400 mt-2 text-sm">Scan an event or peer QR code to check in or connect.</p>
            </div>

            <div id="qr-reader" className="overflow-hidden rounded-3xl border border-white/5 bg-black/50 aspect-square flex items-center justify-center">
              {/* html5-qrcode will render here */}
            </div>

            <div className="mt-8 text-center text-xs text-gray-500 font-mono">
              SOULPASS SECURE SCANNER V1.0
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
