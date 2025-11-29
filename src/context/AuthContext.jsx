import React, { createContext, useState, useEffect, useContext } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Check Session on Load
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        checkVerificationAndSetUser(session.user);
      } else {
        setLoading(false);
      }
    });

    // 2. Listen for Auth Changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        checkVerificationAndSetUser(session.user);
      } else {
        setUser(null);
        setRole(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // --- GATEKEEPER FUNCTION ---
  const checkVerificationAndSetUser = async (authUser) => {
    try {
      // Query the public table to check role and verification
      const { data, error } = await supabase
        .from('user_roles')
        .select('role, is_verified')
        .eq('id', authUser.id)
        .single();

      if (error || !data) {
        console.error("Role check failed:", error);
        // If we can't find the role, we assume unsafe and logout
        await supabase.auth.signOut();
        return;
      }

      // If Verified: Set User
      if (data.is_verified) {
        setUser(authUser);
        setRole(data.role || 'user');
      } else {
        // If Not Verified: Kick out
        await supabase.auth.signOut();
        alert("Your account is pending approval.\nPlease contact the Master Admin.");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const login = (email, password) => supabase.auth.signInWithPassword({ email, password });
  const logout = () => supabase.auth.signOut();


  const register = async (email, password) => {
    // 1. Create Auth User
    // The Database Trigger will automatically create the user_roles row now!
    const { data, error } = await supabase.auth.signUp({ email, password });
    
    if (error) throw error;

    // 2. Force Logout immediately (so they can't use the app yet)
    if (data.user) {
      await supabase.auth.signOut();
    }
    
    return data;
  };

  // ... rest of the file

  return (
    <AuthContext.Provider value={{ user, role, login, logout, register, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};