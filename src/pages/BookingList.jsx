import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Card, Badge } from '../components/UI';
import { Search, Edit, X, Save, AlertTriangle, Trash2, Infinity as InfinityIcon } from 'lucide-react';

export default function BookingList() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Edit State
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ booking_start: '', booking_end: '' });

  // Delete State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState(null);

  useEffect(() => {
    fetchBookings();
  }, []);

  const fetchBookings = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);

      const { data, error } = await supabase
        .from('bookings')
        .select(`
          id,
          booking_start,
          booking_end,
          license_plate_used,
          status,
          is_deleted,
          employees (
            employee_code,
            full_name,
            license_plate
          ),
          parking_spots (
            lot_id,
            price
          )
        `)
        .eq('is_deleted', false); // Filter out deleted items

      if (error) throw error;

      // 1. LOGIC UPDATE: Order by Lot ID (Client-side for better alphanumeric sorting like A1, A2, A10)
      const sortedData = (data || []).sort((a, b) => {
        const lotA = a.parking_spots?.lot_id || '';
        const lotB = b.parking_spots?.lot_id || '';
        return lotA.localeCompare(lotB, undefined, { numeric: true, sensitivity: 'base' });
      });

      setBookings(sortedData);

    } catch (error) {
      console.error("Fetch Error:", error);
      setErrorMsg(error.message);
    } finally {
      setLoading(false);
    }
  };

  const getStatus = (start, end) => {
    if (!start || !end) return 'Unknown';
    const today = new Date();
    today.setHours(0,0,0,0);
    const endDate = new Date(end);
    const startDate = new Date(start);

    if (endDate < today) return 'Expired';
    if (startDate > today) return 'Future';
    return 'Active';
  };

  // --- EDIT HANDLERS ---
  const startEdit = (booking) => {
    setEditingId(booking.id);
    setEditForm({
        booking_start: booking.booking_start ? booking.booking_start.split('T')[0] : '',
        booking_end: booking.booking_end ? booking.booking_end.split('T')[0] : ''
    });
  };

  const setIndefinite = () => {
      setEditForm(prev => ({ ...prev, booking_end: '9999-12-31' }));
  };

  const saveEdit = async () => {
    // Basic date validation
    if (editForm.booking_end < editForm.booking_start) {
        alert("Error: End Date cannot be before Start Date.");
        return;
    }

    // 2. LOGIC UPDATE: Interval/Overlap Check
    const currentBooking = bookings.find(b => b.id === editingId);
    if (!currentBooking) return;

    const currentLotId = currentBooking.parking_spots?.lot_id;
    const newStart = new Date(editForm.booking_start);
    const newEnd = new Date(editForm.booking_end);

    // Check against all OTHER bookings
    const hasConflict = bookings.some(b => {
        // Skip the row we are currently editing
        if (b.id === editingId) return false;
        
        // Skip different Lots (conflicts only matter on the same lot)
        if (b.parking_spots?.lot_id !== currentLotId) return false;

        const otherStart = new Date(b.booking_start);
        const otherEnd = new Date(b.booking_end);

        // Overlap Formula: (StartA <= EndB) and (EndA >= StartB)
        // We set hours to ensure strict date comparison ignoring time
        newStart.setHours(0,0,0,0); newEnd.setHours(0,0,0,0);
        otherStart.setHours(0,0,0,0); otherEnd.setHours(0,0,0,0);

        const isOverlapping = newStart <= otherEnd && newEnd >= otherStart;
        
        if (isOverlapping) {
            console.log(`Conflict detected with Booking ID: ${b.id} on Lot ${currentLotId}`);
        }
        
        return isOverlapping;
    });

    if (hasConflict) {
        alert(`Cannot save: This date range overlaps with another booking for Lot ${currentLotId}.`);
        return;
    }

    try {
        const { error } = await supabase
            .from('bookings')
            .update({
                booking_start: new Date(editForm.booking_start).toISOString(),
                booking_end: new Date(editForm.booking_end).toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('id', editingId);

        if (error) throw error;
        
        alert("Booking updated!");
        setEditingId(null);
        fetchBookings(); 
    } catch (error) {
        alert("Update failed: " + error.message);
    }
  };

  // --- DELETE HANDLERS ---
  const handleDeleteClick = (id) => {
    setSelectedBookingId(id);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!selectedBookingId) return;

    try {
      const { error } = await supabase
        .from('bookings')
        .update({ is_deleted: true })
        .eq('id', selectedBookingId);

      if (error) throw error;

      setBookings(prev => prev.filter(b => b.id !== selectedBookingId));
      setShowDeleteModal(false);
      setSelectedBookingId(null);

    } catch (error) {
      alert("Delete failed: " + error.message);
    }
  };

  const filteredBookings = bookings.filter(b => {
    const searchLower = searchTerm.toLowerCase();
    const code = b.employees?.employee_code || '';
    const name = b.employees?.full_name?.toLowerCase() || '';
    const lot = b.parking_spots?.lot_id?.toLowerCase() || '';
    
    return code.includes(searchTerm) || name.includes(searchLower) || lot.includes(searchLower);
  });

  return (
    <div className="space-y-6 h-[calc(100vh-100px)] flex flex-col animate-in fade-in relative">
      
      {/* --- DELETE CONFIRMATION MODAL --- */}
      {showDeleteModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm rounded-xl">
          <div className="bg-white p-6 rounded-lg shadow-2xl border w-96 text-center animate-in zoom-in-95">
            <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <Trash2 className="text-red-600" size={24} />
            </div>
            <h3 className="text-lg font-bold text-gray-900">Delete Booking?</h3>
            <p className="text-sm text-gray-500 mt-2 mb-6">
              Are you sure you want to remove this booking? This action will hide it from the list.
            </p>
            <div className="flex gap-3 justify-center">
              <button 
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50 text-gray-700 text-sm font-medium"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium shadow-sm"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-[#002D72]">Booking Detail List</h2>
        
        <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input 
                type="text" 
                placeholder="Search Lot, Name, Code..." 
                className="pl-10 pr-4 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
            />
        </div>
      </div>

      {errorMsg && (
        <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-200 flex items-center gap-3">
            <AlertTriangle size={24} />
            <div>
                <p className="font-bold">Error Loading Data</p>
                <p className="text-sm">{errorMsg}</p>
            </div>
        </div>
      )}

      <Card className="flex-1 overflow-hidden flex flex-col">
        <div className="overflow-auto flex-1">
            <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 border-b text-gray-600 sticky top-0 z-10">
                    <tr>
                        <th className="py-3 px-4">Employee Code</th>
                        <th className="py-3 px-4">Full Name</th>
                        <th className="py-3 px-4">Lot ID</th>
                        <th className="py-3 px-4">License Plate</th>
                        <th className="py-3 px-4">Start Date</th>
                        <th className="py-3 px-4">End Date</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-center">Action</th>
                    </tr>
                </thead>
                <tbody className="divide-y">
                    {loading ? (
                        <tr><td colSpan="8" className="p-8 text-center text-gray-500">Loading...</td></tr>
                    ) : filteredBookings.length === 0 ? (
                        <tr><td colSpan="8" className="p-8 text-center text-gray-400">No bookings found.</td></tr>
                    ) : filteredBookings.map((row) => {
                        const status = getStatus(row.booking_start, row.booking_end);
                        const isEditing = editingId === row.id;
                        
                        const isIndefinite = row.booking_end && row.booking_end.startsWith('9999');
                        const displayPlate = row.license_plate_used || row.employees?.license_plate || "-";
                        const displayLot = row.parking_spots?.lot_id || "-";

                        return (
                            <tr key={row.id} className="hover:bg-gray-50">
                                <td className="py-3 px-4 font-mono text-blue-600">{row.employees?.employee_code || "N/A"}</td>
                                <td className="py-3 px-4 font-medium">{row.employees?.full_name || "Unknown"}</td>
                                <td className="py-3 px-4 font-bold text-gray-700">{displayLot}</td>
                                <td className="py-3 px-4 text-gray-500">{displayPlate}</td>
                                
                                {/* START DATE */}
                                <td className="py-3 px-4">
                                    {isEditing ? (
                                        <input 
                                            type="date" 
                                            className="border rounded px-2 py-1 w-32"
                                            value={editForm.booking_start}
                                            onChange={e => setEditForm({...editForm, booking_start: e.target.value})}
                                        />
                                    ) : (
                                        row.booking_start ? new Date(row.booking_start).toLocaleDateString('en-GB') : "-"
                                    )}
                                </td>

                                {/* END DATE */}
                                <td className="py-3 px-4">
                                    {isEditing ? (
                                        <div className="flex flex-col gap-1 items-start">
                                            <input 
                                                type="date" 
                                                className="border rounded px-2 py-1 w-32"
                                                value={editForm.booking_end}
                                                min={editForm.booking_start} 
                                                onChange={e => setEditForm({...editForm, booking_end: e.target.value})}
                                            />
                                            <button 
                                                onClick={setIndefinite}
                                                className="flex items-center gap-1 text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded hover:bg-blue-100 transition"
                                                type="button"
                                            >
                                                <InfinityIcon size={10} /> Set Indefinite
                                            </button>
                                        </div>
                                    ) : (
                                        isIndefinite ? (
                                            <span className="flex items-center gap-1 text-blue-600 bg-blue-50 px-2 py-1 rounded text-xs w-fit">
                                                <InfinityIcon size={12} /> Indefinite
                                            </span>
                                        ) : (
                                            row.booking_end ? new Date(row.booking_end).toLocaleDateString('en-GB') : "-"
                                        )
                                    )}
                                </td>

                                <td className="py-3 px-4">
                                    <Badge color={status === 'Active' ? 'green' : status === 'Future' ? 'blue' : 'gray'}>
                                        {status}
                                    </Badge>
                                </td>

                                <td className="py-3 px-4 flex justify-center gap-2">
                                    {isEditing ? (
                                        <>
                                            <button onClick={saveEdit} className="text-green-600 hover:bg-green-50 p-1 rounded"><Save size={18} /></button>
                                            <button onClick={() => setEditingId(null)} className="text-gray-500 hover:bg-gray-100 p-1 rounded"><X size={18} /></button>
                                        </>
                                    ) : (
                                        <>
                                            <button 
                                                onClick={() => startEdit(row)}
                                                className="text-blue-600 hover:bg-blue-50 p-1 rounded transition"
                                                title="Edit"
                                            >
                                                <Edit size={18} />
                                            </button>
                                            <button 
                                                onClick={() => handleDeleteClick(row.id)}
                                                className="text-red-500 hover:bg-red-50 p-1 rounded transition"
                                                title="Delete"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
      </Card>
    </div>
  );
}