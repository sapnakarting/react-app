
import React, { useState } from 'react';
import { authService } from '../services/authService';
import { User } from '../types';
import { checkSupabaseConnection } from '../services/supabaseClient';

interface LoginProps {
  onLoginSuccess: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const user = await authService.signIn(username, password);
      if (user) {
        onLoginSuccess(user);
      } else {
        setError('Invalid username or password. Please try again.');
      }
    } catch (err: any) {
      console.error('Login error:', err);
      // Run diagnostic on network failure
      const diagnostic = await checkSupabaseConnection();
      if (!diagnostic.success) {
         setError(diagnostic.message);
      } else {
         setError('Connection error. Please check your network and try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 relative overflow-hidden p-6 font-sans">
      <div className="absolute top-0 right-0 w-1/2 h-full bg-amber-500/5 -skew-x-12 translate-x-1/2"></div>
      
      <div className="max-w-md w-full relative z-10 animate-fadeIn">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-black text-white tracking-tighter mb-2 italic">SAPNA <span className="text-amber-500">CARTING</span></h1>
          <p className="text-slate-500 font-bold uppercase tracking-[0.3em] text-[10px]">Industrial Fleet Portal</p>
        </div>

        <div className="bg-white rounded-[2.5rem] shadow-2xl p-10 border border-slate-800/10">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Username</label>
              <input
                type="text"
                required
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-amber-500 font-bold text-slate-900 transition-all"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Password</label>
              <input
                type="password"
                required
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-amber-500 font-bold text-slate-900 transition-all"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <div className="p-4 bg-rose-50 text-rose-600 rounded-xl text-xs font-bold text-center animate-shake">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-5 bg-slate-900 text-white rounded-[2rem] font-black text-lg shadow-xl transition-all border-b-4 border-black uppercase tracking-widest flex items-center justify-center gap-3 ${loading ? 'opacity-70 cursor-not-allowed' : 'hover:bg-black active:scale-[0.98]'}`}
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="mt-10 pt-6 border-t border-slate-100 text-center">
            <p className="text-[9px] text-slate-400 uppercase font-black tracking-widest">Secured Cloud Environment • v2.1.0</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
