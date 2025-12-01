import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Card, Badge } from '../components/UI';
import { Search, Edit, X, Save, Calendar } from 'lucide-react';

export default function BookingList() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Edit State
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ start_date: '', end_date: '' });

  useEffect(() => {
    fetchBookings();
  }, []);

  const fetchBookings = async () => {
    try {
      setLoading(true);
      // We join 'employees' and 'parking_spots' to get details
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          *,
          employees ( employee_code, full_name, license_plates ),
          parking_spots ( price )
        `)
        .order('start_date', { ascending: false });

      if (error) throw error;
      setBookings(data || []);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  // --- CALCULATION HELPERS ---
  const getStatus = (start, end) => {
    const today = new Date();
    today.setHours(0,0,0,0);
    const endDate = new Date(end);
    const startDate = new Date(start);

    if (endDate < today) return 'Expired';
    if (startDate > today) return 'Future';
    return 'Active';
  };

  const calculateFees = (price, start, end) => {
    if (!price || !start || !end) return { total: 0, net: 0 };
    
    const startDate = new Date(start);
    const endDate = new Date(end);
    
    // Calculate difference in days (inclusive)
    const diffTime = Math.abs(endDate - startDate);
    const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; 
    
    // Logic: Assuming monthly price / 30 * days (or standard calculation)
    // For now, let's assume Price is the Monthly Rate.
    // We will apply a standard "Privilege" placeholder (e.g. 0 discount for now)
    
    const dailyRate = price / 30; // Approximation
    const totalFee = dailyRate * days;
    const privilege = 0; // Logic for bond holder discount goes here later
    const netFee = totalFee - privilege;

    return { 
        total: Math.floor(totalFee), 
        net: Math.floor(netFee) 
    };
  };

  // --- EDIT HANDLERS ---
  const startEdit = (booking) => {
    setEditingId(booking.id);
    setEditForm({
        start_date: booking.start_date,
        end_date: booking.end_date
    });
  };

  const saveEdit = async () => {
    try {
        const { error } = await supabase
            .from('bookings')
            .update({
                start_date: editForm.start_date,
                end_date: editForm.end_date
            })
            .eq('id', editingId);

        if (error) throw error;
        
        alert("Booking updated!");
        setEditingId(null);
        fetchBookings(); // Refresh data
    } catch (error) {
        alert("Update failed: " + error.message);
    }
  };

  // --- FILTER ---
  const filteredBookings = bookings.filter(b => 
    b.lot_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.employees?.employee_code.includes(searchTerm) ||
    b.employees?.full_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 h-[calc(100vh-100px)] flex flex-col animate-in fade-in">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-[#002D72]">Booking Detail List</h2>
        
        {/* Search Bar */}
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
                        <th className="py-3 px-4 text-right">Parking Fee</th>
                        <th className="py-3 px-4 text-right">Privilege</th>
                        <th className="py-3 px-4 text-right">Net Fee</th>
                        <th className="py-3 px-4 text-center">Action</th>
                    </tr>
                </thead>
                <tbody className="divide-y">
                    {loading ? (
                        <tr><td colSpan="11" className="p-8 text-center">Loading...</td></tr>
                    ) : filteredBookings.map((row) => {
                        const status = getStatus(row.start_date, row.end_date);
                        const fees = calculateFees(row.parking_spots?.price, row.start_date, row.end_date);
                        const isEditing = editingId === row.id;

                        // Parse License Plates (handle if it's array or null)
                        let plates = "-";
                        if (row.employees?.license_plates) {
                             plates = Array.isArray(row.employees.license_plates) 
                                ? row.employees.license_plates.join(", ") 
                                : row.employees.license_plates;
                        }

                        return (
                            <tr key={row.id} className="hover:bg-gray-50">
                                <td className="py-3 px-4 font-mono text-blue-600">
                                    {row.employees?.employee_code || "N/A"}
                                </td>
                                <td className="py-3 px-4 font-medium">
                                    {row.employees?.full_name || "Unknown"}
                                </td>
                                <td className="py-3 px-4 font-bold text-gray-700">
                                    {row.lot_id}
                                </td>
                                <td className="py-3 px-4 text-gray-500">
                                    {plates}
                                </td>
                                
                                {/* START DATE */}
                                <td className="py-3 px-4">
                                    {isEditing ? (
                                        <input 
                                            type="date" 
                                            className="border rounded px-2 py-1 w-32"
                                            value={editForm.start_date}
                                            onChange={e => setEditForm({...editForm, start_date: e.target.value})}
                                        />
                                    ) : (
                                        new Date(row.start_date).toLocaleDateString('en-GB')
                                    )}
                                </td>

                                {/* END DATE */}
                                <td className="py-3 px-4">
                                    {isEditing ? (
                                        <input 
                                            type="date" 
                                            className="border rounded px-2 py-1 w-32"
                                            value={editForm.end_date}
                                            onChange={e => setEditForm({...editForm, end_date: e.target.value})}
                                        />
                                    ) : (
                                        new Date(row.end_date).toLocaleDateString('en-GB')
                                    )}
                                </td>

                                <td className="py-3 px-4">
                                    <Badge color={status === 'Active' ? 'green' : status === 'Future' ? 'blue' : 'gray'}>
                                        {status}
                                    </Badge>
                                </td>

                                <td className="py-3 px-4 text-right text-gray-500">
                                    {fees.total.toLocaleString()}
                                </td>
                                <td className="py-3 px-4 text-right text-green-600">
                                    0
                                </td>
                                <td className="py-3 px-4 text-right font-bold text-[#002D72]">
                                    {fees.net.toLocaleString()}
                                </td>

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