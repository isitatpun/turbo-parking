import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react'; // <--- Import Icons

export default function Login() {
  const [isRegistering, setIsRegistering] = useState(false);
  
  // Added confirmPassword to state
  const [formData, setFormData] = useState({ email: '', password: '', confirmPassword: '' });
  
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false); // Toggle state
  
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    try {
      if (isRegistering) {
        // --- VALIDATION: Check if passwords match ---
        if (formData.password !== formData.confirmPassword) {
            setError("Passwords do not match!");
            return;
        }

        // --- REGISTER ---
        await register(formData.email, formData.password);
        alert("Registration Successful!\n\nPlease wait for Admin approval.");
        setIsRegistering(false);
        setFormData({ email: '', password: '', confirmPassword: '' });
        
      } else {
        // --- LOGIN ---
        const { error } = await login(formData.email, formData.password);
        if (error) throw error;
        navigate('/');
      }
    } catch (err) {
      // Handle Supabase Errors (Incorrect password, User not found, etc.)
      if (err.message !== 'Auth session missing!') {
          // Translate specific English error to Thai (Optional, usually generic is fine)
          if (err.message === "Invalid login credentials") {
             setError("Incorrect email or password.");
          } else {
             setError(err.message);
          }
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA]">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-gray-100">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-[#002D72]">Turbo Parking</h1>
          <p className="text-gray-500 mt-2">
            {isRegistering ? "Create New Account" : "Sign in to Dashboard"}
          </p>
        </div>

        {/* ERROR BOX */}
        {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-lg mb-4 text-sm font-medium animate-in fade-in slide-in-from-top-2">
                {error}
            </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email Address
            </label>
            <input
              type="email"
              required
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-[#FA4786] outline-none"
              placeholder="AA@turbo.co.th"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>
          
          {/* PASSWORD FIELD */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <div className="relative">
                <input
                type={showPassword ? "text" : "password"}
                required
                placeholder="••••••••"
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-[#FA4786] outline-none pr-10"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
                {/* EYE ICON TOGGLE */}
                <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-gray-400 hover:text-[#FA4786] transition"
                >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
            </div>
          </div>

          {/* CONFIRM PASSWORD (Only for Register) */}
          {isRegistering && (
              <div className="animate-in fade-in slide-in-from-top-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
                <div className="relative">
                    <input
                    type={showPassword ? "text" : "password"}
                    required={isRegistering}
                    placeholder="••••••••"
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-[#FA4786] outline-none pr-10"
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    />
                </div>
              </div>
          )}

          <button
            type="submit"
            className="w-full bg-[#FA4786] text-white font-bold py-3 rounded-xl hover:bg-pink-600 transition shadow-lg shadow-pink-200"
          >
            {isRegistering ? "Request Account" : "Sign In"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => { 
                setIsRegistering(!isRegistering); 
                setError(''); 
                setFormData({ email: '', password: '', confirmPassword: '' });
            }}
            className="text-sm text-[#002D72] hover:underline font-medium"
          >
            {isRegistering 
              ? "Already have an account? Sign In" 
              : "Need an account? Register here"}
          </button>
        </div>
      </div>
    </div>
  );
}