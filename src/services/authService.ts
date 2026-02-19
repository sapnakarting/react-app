
import { User, Role } from '../types';
import { supabase } from './supabaseClient';
import { dbService } from './dbService';

export type AuthMode = 'MANUAL' | 'SUPABASE';

export const AUTH_CONFIG = {
  mode: 'SUPABASE' as AuthMode, // Change this to 'SUPABASE/MANUAL' when you move to the cloud
};

export interface AuthStrategy {
  signIn(username: string, password: string): Promise<User | null>;
  signOut(): Promise<void>;
  getCurrentUser(): Promise<User | null>;
}

const ManualAuthStrategy: AuthStrategy = {
  async signIn(username: string, password: string): Promise<User | null> {
    const user = await dbService.signIn(username, password);
    if (user) {
      localStorage.setItem('sapna_manual_user', JSON.stringify(user));
      return user;
    }
    return null;
  },
  async signOut(): Promise<void> {
    localStorage.removeItem('sapna_manual_user');
  },
  async getCurrentUser(): Promise<User | null> {
    const stored = localStorage.getItem('sapna_manual_user');
    return stored ? JSON.parse(stored) : null;
  }
};

const SupabaseAuthStrategy: AuthStrategy = {
  async signIn(username: string, password: string): Promise<User | null> {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: `${username}@placeholder.com`, // Adjust if using real emails
      password
    });
    
    if (error || !data.user) return null;

    // Fetch profile for role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, username')
      .eq('id', data.user.id)
      .single();

    return {
      id: data.user.id,
      username: profile?.username || data.user.email?.split('@')[0] || '',
      role: (profile?.role as Role) || 'FUEL_AGENT'
    };
  },
  async signOut(): Promise<void> {
    await supabase.auth.signOut();
  },
  async getCurrentUser(): Promise<User | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, username')
      .eq('id', user.id)
      .single();

    return {
      id: user.id,
      username: profile?.username || user.email?.split('@')[0] || '',
      role: (profile?.role as Role) || 'FUEL_AGENT'
    };
  }
};

export const authService = {
  get strategy(): AuthStrategy {
    return AUTH_CONFIG.mode === 'MANUAL' ? ManualAuthStrategy : SupabaseAuthStrategy;
  },
  async signIn(username: string, password: string) {
    return this.strategy.signIn(username, password);
  },
  async signOut() {
    return this.strategy.signOut();
  },
  async getCurrentUser() {
    return this.strategy.getCurrentUser();
  }
};
