'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Zap, Globe, ArrowRight } from 'lucide-react';

export default function LandingPage() {
  const { login, authenticated, ready } = usePrivy();
  const router = useRouter();

  useEffect(() => {
    if (ready && authenticated) {
      router.push('/dashboard');
    }
  }, [ready, authenticated, router]);

  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <main className="flex flex-col items-center justify-center min-h-screen px-4 py-12 overflow-hidden bg-black text-white">
      {/* Background Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-purple-900/20 blur-[120px] rounded-full -z-10"></div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="text-center max-w-3xl"
      >
        <div className="inline-flex items-center px-3 py-1 mb-6 text-sm font-medium border rounded-full border-white/10 bg-white/5 text-purple-400">
          <Zap className="w-4 h-4 mr-2 fill-current" />
          Built on Solana
        </div>
        
        <h1 className="mb-6 text-6xl font-extrabold tracking-tight sm:text-7xl bg-clip-text text-transparent bg-gradient-to-b from-white to-gray-400">
          SOULPASS
        </h1>
        
        <p className="mb-10 text-xl text-gray-400 sm:text-2xl leading-relaxed">
          The reputation layer for real-world communities. 
          Turn every event attendance into permanent, on-chain proof.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={login}
            className="group relative flex items-center justify-center px-8 py-4 text-lg font-bold text-black transition-all bg-white rounded-2xl hover:bg-gray-100 w-full sm:w-auto overflow-hidden"
          >
            Join with Google
            <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </motion.button>
          
          <button className="flex items-center justify-center px-8 py-4 text-lg font-bold text-white transition-all bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 w-full sm:w-auto">
            Explore Events
          </button>
        </div>
      </motion.div>

      {/* Feature Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-24 max-w-6xl w-full">
        <FeatureCard 
          icon={<Globe className="w-8 h-8 text-blue-400" />}
          title="Web2 UX"
          description="Log in with Google. No seed phrases, no gas fees, no friction."
        />
        <FeatureCard 
          icon={<ShieldCheck className="w-8 h-8 text-purple-400" />}
          title="On-Chain Soul"
          description="Your reputation and badges are permanent, soul-bound NFTs on Solana."
        />
        <FeatureCard 
          icon={<Zap className="w-8 h-8 text-yellow-400" />}
          title="Instant Proof"
          description="Check in to events in under 400ms. Seamless and invisible."
        />
      </div>

      {/* Footer Branding */}
      <div className="mt-24 text-gray-500 text-sm font-medium tracking-widest uppercase">
        Powered by Privy + Helius
      </div>
    </main>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <motion.div
      whileHover={{ y: -5 }}
      className="p-8 border border-white/5 bg-white/[0.02] rounded-3xl"
    >
      <div className="mb-4">{icon}</div>
      <h3 className="mb-2 text-xl font-bold">{title}</h3>
      <p className="text-gray-400 leading-relaxed">{description}</p>
    </motion.div>
  );
}
