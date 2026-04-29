'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useWallets } from '@privy-io/react-auth/solana';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { User, Calendar, Award, LogOut, ChevronRight, QrCode, Search, Loader2 } from 'lucide-react';
import QRScanner from '@/components/QRScanner';
import { useOnboarding } from '@/hooks/useOnboarding';
import { useGaslessTransaction } from '@/hooks/useGaslessTransaction';
import { Transaction, TransactionInstruction, PublicKey } from '@solana/web3.js';
import { SOULPASS_PROGRAM_ID } from '@/lib/solana';

export default function Dashboard() {
  const { logout, authenticated, ready, user } = usePrivy();
  const { wallets } = useWallets();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('events');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isRegistering, setIsRegistering] = useState<string | null>(null);
  
  const { isOnboarded, loading: onboardingLoading } = useOnboarding();
  const { sendGaslessTransaction } = useGaslessTransaction();

  useEffect(() => {
    if (ready && !authenticated) {
      router.push('/');
    }
  }, [ready, authenticated, router]);

  const handleRegister = async (eventTitle: string) => {
    if (!wallets[0]) return;
    
    setIsRegistering(eventTitle);
    try {
      // Correctly instantiate PublicKey from the wallet address string
      const userPublicKey = new PublicKey(wallets[0].address);
      
      // For the hackathon, we'll use a deterministic PDA or placeholder for event address
      const eventId = new PublicKey("H7V69vBqSuxyJ5NnFjYvN5xX8yX7z8z9z9z9z9z9z9z9"); // Mock Event ID
      
      const instruction = new TransactionInstruction({
        keys: [
          { pubkey: userPublicKey, isSigner: true, isWritable: true },
          { pubkey: eventId, isSigner: false, isWritable: true },
          { pubkey: PublicKey.default, isSigner: false, isWritable: false }, // System Program
        ],
        programId: new PublicKey(SOULPASS_PROGRAM_ID),
        data: Buffer.from([123, 45, 67]), // Mock instruction data
      });

      const tx = new Transaction().add(instruction);
      const signature = await sendGaslessTransaction(tx);
      
      console.log('Registration successful:', signature);
      alert(`Successfully registered for ${eventTitle}!`);
    } catch (err) {
      console.error('Registration failed:', err);
      alert('Registration failed. Check console for details.');
    } finally {
      setIsRegistering(null);
    }
  };

  const handleScan = (data: string) => {
    console.log('Scanned data:', data);
    // Logic for check-in or networking based on data
    alert(`Scanned: ${data}`);
  };

  if (!ready || !authenticated || onboardingLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0A0A0A] text-white">
        <Loader2 className="w-12 h-12 text-purple-500 animate-spin mb-4" />
        <p className="text-gray-400 font-medium animate-pulse">Syncing your soul...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#0A0A0A] text-white font-sans">
      {/* Top Navbar */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-6 py-4 bg-[#0A0A0A]/80 backdrop-blur-md border-b border-white/5">
        <div className="text-xl font-black tracking-tighter text-white">SOULPASS</div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-full border border-white/10">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-xs font-mono text-gray-400">
              {wallets[0]?.address ? `${wallets[0].address.slice(0, 4)}...${wallets[0].address.slice(-4)}` : 'No Wallet'}
            </span>
          </div>
          <button onClick={logout} className="p-2 text-gray-400 hover:text-white transition-colors">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 px-6 py-8 max-w-lg mx-auto w-full">
        {/* Reputation Overview Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative p-8 mb-10 overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-purple-600 to-indigo-700 shadow-2xl shadow-purple-900/20"
        >
          <div className="relative z-10 flex flex-col items-center">
            <div className="text-white/70 text-sm font-bold uppercase tracking-widest mb-2">My Reputation Score</div>
            <div className="text-7xl font-black mb-4">500</div>
            <div className="flex items-center gap-2 px-4 py-1 bg-white/20 rounded-full backdrop-blur-sm">
              <Award className="w-4 h-4" />
              <span className="text-sm font-bold">Top 5% Networker</span>
            </div>
          </div>
          {/* Abstract blobs */}
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 blur-3xl rounded-full"></div>
          <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-black/20 blur-3xl rounded-full"></div>
        </motion.div>

        {/* Action Tabs */}
        <div className="flex gap-2 mb-8 p-1.5 bg-white/5 rounded-2xl border border-white/5">
          <TabButton 
            active={activeTab === 'events'} 
            onClick={() => setActiveTab('events')}
            icon={<Calendar className="w-4 h-4" />}
            label="Events"
          />
          <TabButton 
            active={activeTab === 'badges'} 
            onClick={() => setActiveTab('badges')}
            icon={<Award className="w-4 h-4" />}
            label="Badges"
          />
          <TabButton 
            active={activeTab === 'network'} 
            onClick={() => setActiveTab('network')}
            icon={<User className="w-4 h-4" />}
            label="Network"
          />
        </div>

        {/* Content Area */}
        {activeTab === 'events' && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-2xl font-bold">Recommended</h2>
              <button className="text-purple-400 font-bold text-sm">View All</button>
            </div>
            
            <EventCard 
              title="Superteam India Build Station"
              location="Bangalore, KA"
              date="April 30, 2026"
              rep="+50 Rep"
              image="https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&q=80&w=800"
              onRegister={() => handleRegister("Superteam India Build Station")}
              isLoading={isRegistering === "Superteam India Build Station"}
            />
            <EventCard 
              title="Solana Colosseum Pitch Day"
              location="New Delhi, DL"
              date="May 5, 2026"
              rep="+100 Rep"
              image="https://images.unsplash.com/photo-1559223607-a43c990c692c?auto=format&fit=crop&q=80&w=800"
              onRegister={() => handleRegister("Solana Colosseum Pitch Day")}
              isLoading={isRegistering === "Solana Colosseum Pitch Day"}
            />
          </motion.div>
        )}

        {/* Floating QR FAB */}
        <button 
          onClick={() => setIsScannerOpen(true)}
          className="fixed bottom-8 right-8 w-16 h-16 bg-white text-black rounded-2xl flex items-center justify-center shadow-xl shadow-white/10 hover:scale-110 active:scale-90 transition-transform z-50"
        >
          <QrCode className="w-8 h-8" />
        </button>
      </main>

      <QRScanner 
        isOpen={isScannerOpen} 
        onClose={() => setIsScannerOpen(false)} 
        onScan={handleScan} 
      />
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl transition-all font-bold text-sm ${
        active ? 'bg-white text-black shadow-lg' : 'text-gray-500 hover:text-gray-300'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function EventCard({ title, location, date, rep, image, onRegister, isLoading }: { 
  title: string, 
  location: string, 
  date: string, 
  rep: string, 
  image: string,
  onRegister: () => void,
  isLoading: boolean
}) {
  return (
    <div className="group relative overflow-hidden rounded-[2rem] bg-white/[0.03] border border-white/5 hover:bg-white/[0.05] transition-all">
      <div className="aspect-[16/9] overflow-hidden">
        <img src={image} alt={title} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
      </div>
      <div className="p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-xl font-bold mb-1">{title}</h3>
            <p className="text-sm text-gray-500">{location} • {date}</p>
          </div>
          <div className="px-3 py-1 bg-purple-500/20 text-purple-400 rounded-full text-xs font-black uppercase tracking-tighter">
            {rep}
          </div>
        </div>
        <button 
          onClick={onRegister}
          disabled={isLoading}
          className="w-full py-4 bg-white/5 group-hover:bg-white text-white group-hover:text-black rounded-2xl font-bold transition-all border border-white/10 group-hover:border-white disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isLoading && <Loader2 className="w-5 h-5 animate-spin" />}
          {isLoading ? 'Registering...' : 'Register Now'}
        </button>
      </div>
    </div>
  );
}
