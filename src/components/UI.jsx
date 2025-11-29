import React from 'react';
import { X } from 'lucide-react';

// 1. Reusable Card
export const Card = ({ children, className = "" }) => (
  <div className={`bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden ${className}`}>
    {children}
  </div>
);

// 2. Reusable Badge
export const Badge = ({ children, color }) => {
  const styles = {
    pink: 'bg-[#FA4786]/10 text-[#FA4786]',
    green: 'bg-green-100 text-green-700',
    red: 'bg-red-100 text-red-700',
    blue: 'bg-blue-100 text-[#002D72]',
  };
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${styles[color] || styles.blue}`}>
      {children}
    </span>
  );
};

// 3. Reusable Modal (Popup)
export const Modal = ({ isOpen, onClose, title, children, onSave, saveLabel = "Save" }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-[500px] animate-in fade-in zoom-in duration-200">
        <div className="flex justify-between items-center mb-6 border-b pb-3">
          <h3 className="text-xl font-bold text-[#002D72]">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>
        <div className="mb-6 max-h-[60vh] overflow-y-auto">
            {children}
        </div>
        <div className="flex justify-end gap-3 pt-3 border-t">
          <button onClick={onClose} className="px-5 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition">
            ยกเลิก (Cancel)
          </button>
          <button onClick={onSave} className="px-5 py-2 bg-[#FA4786] text-white rounded-lg hover:bg-pink-600 shadow-lg shadow-pink-200 font-medium transition">
            {saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
};