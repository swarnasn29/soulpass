import { usePrivy } from '@privy-io/react-auth';
import { useWallets } from '@privy-io/react-auth/solana';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export function useOnboarding() {
  const { user, authenticated, ready } = usePrivy();
  const { wallets } = useWallets();
  const [isOnboarded, setIsOnboarded] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    async function checkOnboarding() {
      console.log('Onboarding check:', { 
        ready, 
        authenticated, 
        walletCount: wallets.length,
        hasUser: !!user,
        userWallets: user?.linkedAccounts?.filter(a => a.type === 'wallet').length
      });
      
      if (!ready || !authenticated) return;
      
      if (wallets.length === 0) {
        console.log('Waiting for wallets...');
        // Set a timeout to stop loading even if no wallet appears
        timeoutId = setTimeout(() => {
          console.log('Onboarding check timed out waiting for wallets');
          setLoading(false);
        }, 8000); // 8 seconds timeout
        return;
      }

      try {
        const walletAddress = wallets[0].address;
        console.log('Checking onboarding for:', walletAddress);
        
        // 1. Check if user exists in Supabase
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('wallet_address', walletAddress)
          .single();

        if (error && error.code !== 'PGRST116') {
          console.error('Supabase error:', error);
          // If it's a connection error or something, we might want to retry
          // but for now we'll just continue and hope it works next time
          setLoading(false);
          return;
        }

        if (!data) {
          console.log('Creating new user profile...');
          // 2. Create profile if it doesn't exist
          const { error: insertError } = await supabase
            .from('users')
            .insert([
              { 
                wallet_address: walletAddress,
                email: user?.email?.address,
                display_name: user?.email?.address?.split('@')[0] || 'SoulPass User',
                avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${walletAddress}`
              }
            ]);

          if (insertError) {
            console.error('Insert error:', insertError);
            throw insertError;
          }
        }

        setIsOnboarded(true);
      } catch (err) {
        console.error('Onboarding check failed:', err);
      } finally {
        setLoading(false);
      }
    }

    checkOnboarding();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [ready, authenticated, wallets, user]);

  return { isOnboarded, loading };
}
