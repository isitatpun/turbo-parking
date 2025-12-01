import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import MainLayout from './layout/MainLayout';

// Pages
import Login from './pages/Login';
import Home from './pages/Home';
import Booking from './pages/Booking';
import BookingList from './pages/BookingList'; // <--- NEW IMPORT
import CarParkPage from './pages/CarParkPage';
import Employees from './pages/Employees';
import BondHolder from './pages/BondHolder';
import UserManagement from './pages/UserManagement';

// --- 1. PROTECTED ROUTE (Checks if Logged In) ---
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) return <div className="flex h-screen items-center justify-center text-[#002D72] font-bold">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  
  return children;
};

// --- 2. ADMIN ROUTE (Checks if Role is Admin OR Master Admin) ---
const AdminRoute = ({ children }) => {
  const { role, loading } = useAuth();

  if (loading) return <div className="flex h-screen items-center justify-center text-[#002D72] font-bold">Checking Permissions...</div>;
  
  // Allow if Admin OR Master Admin
  if (role !== 'admin' && role !== 'master_admin') {
    return <Navigate to="/" replace />;
  }
  
  return children;
};

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Route */}
          <Route path="/login" element={<Login />} />
          
          {/* Protected Area */}
          <Route path="/" element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }>
            {/* General Access (Admin + User) */}
            <Route index element={<Home />} />
            <Route path="booking" element={<Booking />} />

            {/* Admin Only Access */}
            
            {/* --- NEW PAGE: Booking Detail List --- */}
            <Route path="booking-list" element={
              <AdminRoute>
                <BookingList />
              </AdminRoute>
            } />

            <Route path="car-park" element={
              <AdminRoute>
                <CarParkPage />
              </AdminRoute>
            } />
            
            <Route path="employees" element={
              <AdminRoute>
                <Employees />
              </AdminRoute>
            } />
            
            <Route path="bond-holder" element={
              <AdminRoute>
                <BondHolder />
              </AdminRoute>
            } />

            <Route path="users" element={
              <AdminRoute>
                <UserManagement />
              </AdminRoute>
            } />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}