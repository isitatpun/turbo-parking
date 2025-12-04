import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Card, Modal } from '../components/UI';
import { Plus, Edit2, Trash2 } from 'lucide-react';

export default function ZoneManagement() {
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  
  // Revised: Changed 'code' to 'lot_code'
  const [formData, setFormData] = useState({ lot_code: '', name: '' });

  useEffect(() => {
    fetchZones();
  }, []);

  const fetchZones = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('zones')
        .select('*')
        .order('lot_code', { ascending: true }); // Revised: Order by lot_code
      
      if (error) throw error;
      setZones(data || []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    // Revised: Validation checks lot_code
    if (!formData.lot_code || !formData.name) return alert("Please fill all fields");

    // --- DUPLICATE CHECK ---
    const isDuplicate = zones.some(z => 
        z.lot_code.toLowerCase() === formData.lot_code.toLowerCase() && 
        z.id !== editingId 
    );

    if (isDuplicate) {
        alert(`Error: Zone Code "${formData.lot_code}" already exists.`);
        return;
    }

    try {
      if (editingId) {
        const { error } = await supabase.from('zones').update(formData).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('zones').insert([formData]);
        if (error) throw error;
      }
      
      setModalOpen(false);
      fetchZones();
    } catch (error) {
      if (error.code === '23505') {
          alert(`Error: Zone Code "${formData.lot_code}" already exists (Database Constraint).`);
      } else {
          alert("Error: " + error.message);
      }
    }
  };

  const handleDelete = async (id) => {
    if(!window.confirm("Delete this zone? Note: Spots using this zone might lose their reference.")) return;
    try {
        const { error } = await supabase.from('zones').delete().eq('id', id);
        if (error) throw error;
        fetchZones();
    } catch (error) {
        alert("Error: " + error.message);
    }
  };

  const openModal = (zone = null) => {
      if (zone) {
          setEditingId(zone.id);
          // Revised: Map existing data to lot_code
          setFormData({ lot_code: zone.lot_code, name: zone.name });
      } else {
          setEditingId(null);
          setFormData({ lot_code: '', name: '' });
      }
      setModalOpen(true);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-[#002D72]">Zone Configuration</h2>
        <button 
            onClick={() => openModal()} 
            className="bg-[#002D72] text-white px-4 py-2 rounded-xl flex items-center gap-2 hover:bg-blue-900 shadow-lg transition"
        >
          <Plus size={18} /> Add Zone
        </button>
      </div>

      <Card>
        {loading ? <div className="p-8 text-center text-gray-500">Loading Zones...</div> : (
            <table className="w-full text-left">
                <thead className="bg-gray-50 border-b text-gray-600">
                    <tr>
                        <th className="py-3 px-4">Code</th>
                        <th className="py-3 px-4">Description Name</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y">
                    {zones.map((z) => (
                        <tr key={z.id} className="hover:bg-gray-50">
                            {/* Revised: Display lot_code */}
                            <td className="py-3 px-4 font-bold text-[#002D72]">{z.lot_code}</td>
                            <td className="py-3 px-4">{z.name}</td>
                            <td className="py-3 px-4 text-right flex justify-end gap-2">
                                <button onClick={() => openModal(z)} className="text-blue-600 hover:bg-blue-50 p-2 rounded-lg"><Edit2 size={16}/></button>
                                <button onClick={() => handleDelete(z.id)} className="text-red-500 hover:bg-red-50 p-2 rounded-lg"><Trash2 size={16}/></button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        )}
      </Card>

      <Modal 
        isOpen={modalOpen} 
        onClose={() => setModalOpen(false)} 
        title={editingId ? "Edit Zone" : "Add New Zone"} 
        onSave={handleSave}
      >
        <div className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Zone Code (e.g. A, B, ZA)</label>
                <input 
                    type="text" 
                    className="w-full border rounded-lg p-2 uppercase" 
                    value={formData.lot_code} 
                    // Revised: Update lot_code state
                    onChange={e => setFormData({...formData, lot_code: e.target.value.toUpperCase()})} 
                    placeholder="Enter unique code"
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description (e.g. ริมถนน)</label>
                <input 
                    type="text" 
                    className="w-full border rounded-lg p-2" 
                    value={formData.name} 
                    onChange={e => setFormData({...formData, name: e.target.value})}
                />
            </div>
        </div>
      </Modal>
    </div>
  );
}