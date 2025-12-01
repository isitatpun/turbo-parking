import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Card, Badge } from '../components/UI';
import { Search, Edit, X, Save, AlertTriangle } from 'lucide-react';

export default function BookingList() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Edit State
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ booking_start: '', booking_end: '' });

  useEffect(() => {
    fetchBookings();
  }, []);

  const fetchBookings = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);

      // --- MATCHING YOUR EXACT SCHEMA ---
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          id,
          booking_start,
          booking_end,
          license_plate_used,
          status,
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
        .order('booking_start', { ascending: false });

      if (error) throw error;
      setBookings(data || []);

    } catch (error) {
      console.error("Fetch Error:", error);
      setErrorMsg(error.message);
    } finally {
      setLoading(false);
    }
  };

  // --- STATUS LOGIC ---
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

  // --- FEE CALCULATION ---
  const calculateFees = (price, start, end) => {
    if (!price || !start || !end) return { total: 0, net: 0 };
    
    const startDate = new Date(start);
    const endDate = new Date(end);
    
    // Calculate days
    const diffTime = Math.abs(endDate - startDate);
    const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; 
    
    // Logic: (Price / 30) * Days
    const dailyRate = price / 30; 
    const totalFee = dailyRate * days;
    const privilege = 0; // Future logic
    const netFee = totalFee - privilege;

    return { 
        total: Math.floor(totalFee), 
        net: Math.floor(netFee) 
    };
  };

  // --- EDIT HANDLERS ---
  const startEdit = (booking) => {
    setEditingId(booking.id);
    // Format dates for HTML input (YYYY-MM-DD)
    setEditForm({
        booking_start: booking.booking_start ? booking.booking_start.split('T')[0] : '',
        booking_end: booking.booking_end ? booking.booking_end.split('T')[0] : ''
    });
  };

  const saveEdit = async () => {
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
        
        alert("Booking dates updated!");
        setEditingId(null);
        fetchBookings(); // Refresh data
    } catch (error) {
        alert("Update failed: " + error.message);
    }
  };

  // --- FILTER ---
  const filteredBookings = bookings.filter(b => {
    const searchLower = searchTerm.toLowerCase();
    const code = b.employees?.employee_code || '';
    const name = b.employees?.full_name?.toLowerCase() || '';
    const lot = b.parking_spots?.lot_id?.toLowerCase() || ''; // Access nested lot_id
    
    return code.includes(searchTerm) || name.includes(searchLower) || lot.includes(searchLower);
  });

  return (
    <div className="space-y-6 h-[calc(100vh-100px)] flex flex-col animate-in fade-in">
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
                        <th className="py-3 px-4 text-right">Fee</th>
                        <th className="py-3 px-4 text-center">Action</th>
                    </tr>
                </thead>
                <tbody className="divide-y">
                    {loading ? (
                        <tr><td colSpan="9" className="p-8 text-center text-gray-500">Loading booking data...</td></tr>
                    ) : filteredBookings.length === 0 ? (
                        <tr><td colSpan="9" className="p-8 text-center text-gray-400">No bookings found.</td></tr>
                    ) : filteredBookings.map((row) => {
                        const status = getStatus(row.booking_start, row.booking_end);
                        const fees = calculateFees(row.parking_spots?.price, row.booking_start, row.booking_end);
                        const isEditing = editingId === row.id;

                        // Display Logic: Prefer 'license_plate_used' from booking, else fall back to employee default
                        const displayPlate = row.license_plate_used || row.employees?.license_plate || "-";
                        const displayLot = row.parking_spots?.lot_id || "-";

                        return (
                            <tr key={row.id} className="hover:bg-gray-50">
                                {/* CODE */}
                                <td className="py-3 px-4 font-mono text-blue-600">
                                    {row.employees?.employee_code || "N/A"}
                                </td>
                                
                                {/* NAME */}
                                <td className="py-3 px-4 font-medium">
                                    {row.employees?.full_name || "Unknown"}
                                </td>
                                
                                {/* LOT ID (From Parking Spot Relation) */}
                                <td className="py-3 px-4 font-bold text-gray-700">
                                    {displayLot}
                                </td>
                                
                                {/* LICENSE */}
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
                                        <input 
                                            type="date" 
                                            className="border rounded px-2 py-1 w-32"
                                            value={editForm.booking_end}
                                            onChange={e => setEditForm({...editForm, booking_end: e.target.value})}
                                        />
                                    ) : (
                                        row.booking_end ? new Date(row.booking_end).toLocaleDateString('en-GB') : "-"
                                    )}
                                </td>

                                {/* STATUS */}
                                <td className="py-3 px-4">
                                    <Badge color={status === 'Active' ? 'green' : status === 'Future' ? 'blue' : 'gray'}>
                                        {status}
                                    </Badge>
                                </td>

                                {/* NET FEE */}
                                <td className="py-3 px-4 text-right font-bold text-[#002D72]">
                                    {fees.net.toLocaleString()}
                                </td>

                                {/* ACTIONS */}
                                <td className="py-3 px-4 flex justify-center gap-2">
                                    {isEditing ? (
                                        <>
                                            <button onClick={saveEdit} className="text-green-600 hover:bg-green-50 p-1 rounded">
                                                <Save size={18} />
                                            </button>
                                            <button onClick={() => setEditingId(null)} className="text-red-500 hover:bg-red-50 p-1 rounded">
                                                <X size={18} />
                                            </button>
                                        </>
                                    ) : (
                                        <button 
                                            onClick={() => startEdit(row)}
                                            className="text-blue-600 hover:bg-blue-50 p-1 rounded transition"
                                            title="Edit Dates"
                                        >
                                            <Edit size={18} />
                                        </button>
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