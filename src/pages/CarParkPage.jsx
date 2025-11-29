import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Card, Badge, Modal } from '../components/UI';
import { Plus, Edit2, Trash2 } from 'lucide-react';

export default function CarParkPage() {
  const [spots, setSpots] = useState([]); 
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  
  const [editingId, setEditingId] = useState(null);
  
  const [formData, setFormData] = useState({ 
    lot_code: '', 
    spot_number: '', 
    zone_text: 'Zone A', 
    roof_type: 'No', 
    spot_type: 'General Parking', // <--- UPDATED DEFAULT
    price: '' 
  });

  useEffect(() => {
    fetchSpots();
  }, []);

  const fetchSpots = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('parking_spots')
        .select('*')
        .eq('is_active', true)
        .order('id', { ascending: true });

      if (error) throw error;
      setSpots(data);
    } catch (error) {
      alert('Error loading data: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (spot) => {
    setEditingId(spot.id);
    setFormData({
        lot_code: spot.lot_code,
        spot_number: spot.spot_number,
        zone_text: spot.zone_text,
        roof_type: spot.roof_type ? 'Yes' : 'No', 
        spot_type: spot.spot_type,
        price: spot.price
    });
    setModalOpen(true);
  };

  const handleAddClick = () => {
      setEditingId(null);
      // <--- UPDATED RESET STATE
      setFormData({ lot_code: '', spot_number: '', zone_text: 'Zone A', roof_type: 'No', spot_type: 'General Parking', price: '' });
      setModalOpen(true);
  };

  const handleSave = async () => {
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
        const { error } = await supabase.from('parking_spots').insert([{ ...spotData, is_active: true, effective_from: new Date() }]);
        if (error) throw error;
        alert("Created successfully!");
      }

      setModalOpen(false);
      fetchSpots();
    } catch (error) {
      alert("Error saving: " + error.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this spot?")) return;
    try {
      const { error } = await supabase
        .from('parking_spots')
        .update({ is_active: false, expired_at: new Date() })
        .eq('id', id);

      if (error) throw error;
      fetchSpots();
    } catch (error) {
      alert("Error deleting: " + error.message);
    }
  };

  // <--- UPDATED BADGE COLORS TO MATCH NEW NAMES
  const getBadgeColor = (type) => {
    if (type === 'Reserved (Paid) Parking') return 'pink';
    if (type === 'EV Charging Parking') return 'green';
    return 'blue'; // Default for General Parking
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-[#002D72]">Car Park Spots</h2>
        <button onClick={handleAddClick} className="bg-[#FA4786] text-white px-4 py-2 rounded-xl flex items-center gap-2 hover:bg-pink-600 shadow-lg shadow-pink-200 transition">
          <Plus size={18} /> Add Parking Spot
        </button>
      </div>

      <Card>
        {loading ? (
            <div className="p-8 text-center text-gray-500">Loading data...</div>
        ) : (
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
                    <button onClick={() => handleEditClick(row)} className="text-blue-600 hover:bg-blue-50 p-2 rounded-lg"><Edit2 size={16}/></button>
                    <button onClick={() => handleDelete(row.id)} className="text-red-500 hover:bg-red-50 p-2 rounded-lg"><Trash2 size={16}/></button>
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
        title={editingId ? "Edit Parking Spot" : "Add Parking Spot"} 
        onSave={handleSave}
      >
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Lot Code</label>
            <input type="text" className="w-full border rounded-lg p-2" value={formData.lot_code} onChange={e=>setFormData({...formData, lot_code: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Spot Number</label>
            <input type="number" className="w-full border rounded-lg p-2" value={formData.spot_number} onChange={e=>setFormData({...formData, spot_number: e.target.value})} />
          </div>
          <div className="col-span-2">
             <label className="block text-sm font-medium text-gray-700 mb-1">Zone Text</label>
             <input type="text" className="w-full border rounded-lg p-2" placeholder="e.g. ริมถนน" value={formData.zone_text} onChange={e=>setFormData({...formData, zone_text: e.target.value})} />
          </div>
          <div>
             <label className="block text-sm font-medium text-gray-700 mb-1">Roof</label>
             <select className="w-full border rounded-lg p-2" value={formData.roof_type} onChange={e=>setFormData({...formData, roof_type: e.target.value})}>
                <option>Yes</option><option>No</option>
             </select>
          </div>
          <div>
             <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
             {/* <--- UPDATED OPTIONS HERE */}
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