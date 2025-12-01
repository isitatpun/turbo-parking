import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Card, Badge, Modal } from '../components/UI';
import { Plus, Edit2, Trash2, Map, AlertTriangle, Settings } from 'lucide-react';

export default function CarParkPage() {
  const [spots, setSpots] = useState([]); 
  const [zones, setZones] = useState([]); 
  const [loading, setLoading] = useState(true);
  
  const [spotModalOpen, setSpotModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [formData, setFormData] = useState({ 
    lot_code: '', 
    spot_number: '', 
    zone_text: '', 
    roof_type: 'No', 
    spot_type: 'General Parking', 
    price: '' 
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      const { data: spotsData, error: spotsError } = await supabase
        .from('parking_spots')
        .select('*')
        .eq('is_active', true)
        .order('lot_id', { ascending: true });
      if (spotsError) throw spotsError;

      const { data: zonesData, error: zonesError } = await supabase
        .from('zones')
        .select('*')
        .order('code', { ascending: true });
      if (zonesError) throw zonesError;

      setSpots(spotsData);
      setZones(zonesData);

    } catch (error) {
      alert('Error loading data: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // --- MODAL ACTIONS ---
  const handleAddSpotClick = () => {
      setEditingId(null);
      setFormData({ 
          lot_code: '', // Start empty
          spot_number: '', 
          zone_text: '', // Start empty
          roof_type: 'No', 
          spot_type: 'General Parking', 
          price: '' 
      });
      setSpotModalOpen(true);
  };

  const handleEditSpotClick = (spot) => {
    setEditingId(spot.id);
    setFormData({
        lot_code: spot.lot_code,
        spot_number: spot.spot_number,
        zone_text: spot.zone_text,
        roof_type: spot.roof_type ? 'Yes' : 'No', 
        spot_type: spot.spot_type,
        price: spot.price
    });
    setSpotModalOpen(true);
  };

  // --- NEW: HANDLE MANUAL LOT CODE INPUT WITH AUTO-LOOKUP ---
  const handleLotCodeChange = (e) => {
      const inputCode = e.target.value.toUpperCase(); // Force Uppercase
      
      // 1. Try to find a matching zone
      const matchedZone = zones.find(z => z.code === inputCode);

      // 2. Update State
      setFormData(prev => ({
          ...prev,
          lot_code: inputCode,
          // If match found, auto-fill description. If not, clear it or leave it.
          zone_text: matchedZone ? matchedZone.name : '' 
      }));
  };

  const handleSpotSave = async () => {
    if (!formData.lot_code || !formData.spot_number) {
        alert("Please enter a Lot Code and Spot Number.");
        return;
    }

    // Duplicate Check
    const isDuplicate = spots.some(s => 
        s.lot_code === formData.lot_code && 
        String(s.spot_number) === String(formData.spot_number) &&
        s.id !== editingId
    );

    if (isDuplicate) {
        alert(`Error: Spot ${formData.lot_code}-${formData.spot_number} already exists!`);
        return;
    }

    try {
      const spotData = {
        lot_code: formData.lot_code,
        spot_number: parseInt(formData.spot_number),
        zone_text: formData.zone_text,
        roof_type: formData.roof_type === 'Yes', 
        spot_type: formData.spot_type,
        price: parseFloat(formData.price) || 0,
        updated_at: new Date() 
      };

      if (editingId) {
        const { error } = await supabase.from('parking_spots').update(spotData).eq('id', editingId);
        if (error) throw error;
        alert("Updated successfully!");
      } else {
        const generatedLotId = `${spotData.lot_code}${spotData.spot_number}`;
        
        const { error } = await supabase.from('parking_spots').insert([{ 
            ...spotData, 
            lot_id: generatedLotId, 
            is_active: true, 
            effective_from: new Date() 
        }]);
        if (error) throw error;
        alert("Created successfully!");
      }

      setSpotModalOpen(false);
      fetchData(); 
    } catch (error) {
      alert("Error saving: " + error.message);
    }
  };

  const handleDeleteSpot = async (id) => {
    if (!window.confirm("Are you sure you want to delete this spot?")) return;
    try {
      const { error } = await supabase
        .from('parking_spots')
        .update({ is_active: false, expired_at: new Date() })
        .eq('id', id);

      if (error) throw error;
      fetchData();
    } catch (error) {
      alert("Error deleting: " + error.message);
    }
  };

  const getBadgeColor = (type) => {
    if (type === 'Reserved (Paid) Parking') return 'pink';
    if (type === 'EV Charging Parking') return 'green';
    return 'blue';
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-[#002D72]">Car Park Spots</h2>
        
        {/* ADD SPOT BUTTON */}
        <button 
            onClick={handleAddSpotClick}
            className="bg-[#FA4786] text-white px-4 py-2 rounded-xl flex items-center gap-2 hover:bg-pink-600 shadow-lg shadow-pink-200 transition"
        >
            <Plus size={18} /> Add Parking Spot
        </button>
      </div>

      <Card>
        {loading ? (
            <div className="p-8 text-center text-gray-500">Loading data...</div>
        ) : (
            <div className="overflow-auto">
                <table className="w-full text-left">
                <thead className="bg-gray-50 border-b text-gray-600">
                    <tr>
                    <th className="py-3 px-4">Lot ID</th>
                    <th className="py-3 px-4">Zone</th>
                    <th className="py-3 px-4">Roof</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Price</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {spots.length === 0 && (
                        <tr><td colSpan="6" className="p-4 text-center text-gray-400">No parking spots found.</td></tr>
                    )}
                    {spots.map((row) => (
                    <tr key={row.id} className="border-b hover:bg-gray-50 transition">
                        <td className="py-3 px-4 font-bold text-[#002D72]">
                            {row.lot_id || `${row.lot_code} ${row.spot_number}`}
                        </td>
                        <td className="py-3 px-4">{row.zone_text}</td>
                        <td className="py-3 px-4">{row.roof_type ? 'Yes' : 'No'}</td>
                        <td className="py-3 px-4">
                            <Badge color={getBadgeColor(row.spot_type)}>{row.spot_type}</Badge>
                        </td>
                        <td className="py-3 px-4">{row.price.toLocaleString()}</td>
                        <td className="py-3 px-4 text-right flex justify-end gap-2">
                            <button onClick={() => handleEditSpotClick(row)} className="text-blue-600 hover:bg-blue-50 p-2 rounded-lg"><Edit2 size={16}/></button>
                            <button onClick={() => handleDeleteSpot(row.id)} className="text-red-500 hover:bg-red-50 p-2 rounded-lg"><Trash2 size={16}/></button>
                        </td>
                    </tr>
                    ))}
                </tbody>
                </table>
            </div>
        )}
      </Card>

      {/* ======================= */}
      {/* SPOT MODAL (Add/Edit)   */}
      {/* ======================= */}
      <Modal 
        isOpen={spotModalOpen} 
        onClose={() => setSpotModalOpen(false)} 
        title={editingId ? "Edit Parking Spot" : "Add Parking Spot"} 
        onSave={handleSpotSave}
      >
        <div className="grid grid-cols-2 gap-4">
          
          {/* 1. LOT CODE (EDITABLE + AUTO LOOKUP) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Lot Code</label>
            <input 
                type="text" 
                className="w-full border rounded-lg p-2 uppercase focus:ring-2 focus:ring-[#FA4786] outline-none" 
                value={formData.lot_code} 
                onChange={handleLotCodeChange} // <--- LOOKUP LOGIC ATTACHED
                placeholder="e.g. A"
            />
          </div>

          {/* 2. SPOT NUMBER */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Spot Number</label>
            <input 
                type="number" 
                className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-[#FA4786] outline-none" 
                value={formData.spot_number} 
                onChange={e=>setFormData({...formData, spot_number: e.target.value})} 
                placeholder="e.g. 101"
            />
          </div>

          {/* 3. ZONE DESCRIPTION (READ ONLY - Auto Filled) */}
          <div className="col-span-2">
             <label className="block text-sm font-medium text-gray-500 mb-1">Zone Description (Auto-filled)</label>
             <input 
                type="text" 
                className="w-full border rounded-lg p-2 bg-gray-100 text-gray-500 cursor-not-allowed" 
                value={formData.zone_text} 
                placeholder="Type Lot Code above to find Zone..."
                readOnly 
             />
          </div>

          {/* 4. OTHER FIELDS */}
          <div>
             <label className="block text-sm font-medium text-gray-700 mb-1">Roof</label>
             <select className="w-full border rounded-lg p-2" value={formData.roof_type} onChange={e=>setFormData({...formData, roof_type: e.target.value})}>
                <option>Yes</option><option>No</option>
             </select>
          </div>
          <div>
             <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
             <select className="w-full border rounded-lg p-2" value={formData.spot_type} onChange={e=>setFormData({...formData, spot_type: e.target.value})}>
                <option value="General Parking">General Parking</option>
                <option value="EV Charging Parking">EV Charging Parking</option>
                <option value="Reserved (Paid) Parking">Reserved (Paid) Parking</option>
             </select>
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Price</label>
            <input type="number" className="w-full border rounded-lg p-2" value={formData.price} onChange={e=>setFormData({...formData, price: e.target.value})} />
          </div>
        </div>
      </Modal>
    </div>
  );
}