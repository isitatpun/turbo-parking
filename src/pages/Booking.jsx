import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Card, Badge, Modal } from '../components/UI';
import { Calendar, SquarePen, Filter, CheckCircle, AlertCircle, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Booking() {
  const { role } = useAuth();

  // --- STATE ---
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  
  const [spots, setSpots] = useState([]);
  const [bookings, setBookings] = useState([]); 
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterZone, setFilterZone] = useState('All');
  const [filterType, setFilterType] = useState('Reserved (Paid) Parking'); 
  const [filterStatus, setFilterStatus] = useState('All'); 

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [targetSpot, setTargetSpot] = useState(null);
  const [bookingForm, setBookingForm] = useState({
    employee_id: '',
    start_date: '',
    end_date: '',
    is_indefinite: false
  });

  // Search State for Modal
  const [empSearch, setEmpSearch] = useState('');

  // --- 1. LOAD DATA ---
  useEffect(() => {
    fetchData();
  }, [selectedDate]); 

  const fetchData = async () => {
    try {
      setLoading(true);

      const { data: spotsData } = await supabase
        .from('parking_spots')
        .select('*')
        .eq('is_active', true)
        .order('lot_id', { ascending: true });

      const { data: empData } = await supabase
        .from('employees')
        .select('id, employee_code, full_name, license_plate')
        .eq('is_active', true);

      const { data: bookingData } = await supabase
        .from('bookings')
        .select(`*, employees (employee_code, full_name, license_plate)`)
        .gte('booking_end', selectedDate); 

      setSpots(spotsData || []);
      setEmployees(empData || []);
      setBookings(bookingData || []);

    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  // --- 2. DATA PROCESSING ---
  const uniqueZones = ['All', ...new Set(spots.map(s => s.zone_text))];
  const uniqueTypes = ['All', ...new Set(spots.map(s => s.spot_type))].sort();

  const processedSpots = spots.map(spot => {
    const activeBooking = bookings.find(b => 
        b.spot_id === spot.id && 
        b.booking_start <= selectedDate && 
        b.booking_end >= selectedDate
    );

    const searchDate = activeBooking ? activeBooking.booking_end : selectedDate;
    
    const nextBooking = bookings
        .filter(b => b.spot_id === spot.id && b.booking_start > searchDate)
        .sort((a, b) => new Date(a.booking_start) - new Date(b.booking_start))[0];

    const status = activeBooking ? 'Occupied' : 'Available';
    
    return { ...spot, activeBooking, nextBooking, status };
  }).filter(spot => {
    const matchZone = filterZone === 'All' || spot.zone_text === filterZone;
    const matchType = filterType === 'All' || spot.spot_type === filterType;
    const matchStatus = filterStatus === 'All' || 
                        (filterStatus === 'Occupied' && spot.status === 'Occupied') ||
                        (filterStatus === 'Available' && spot.status === 'Available');
    return matchZone && matchType && matchStatus;
  });

  // --- 3. FILTER EMPLOYEES ---
  const filteredEmployees = employees.filter(emp => 
    emp.employee_code.includes(empSearch) || 
    emp.full_name.toLowerCase().includes(empSearch.toLowerCase())
  );

  // --- 4. ACTIONS ---
  const openBookingModal = (spot) => {
    setTargetSpot(spot);
    setEmpSearch(''); 
    setBookingForm({
        employee_id: '',
        start_date: selectedDate, 
        end_date: '',
        is_indefinite: false
    });
    setIsModalOpen(true);
  };

  const handleBookingSave = async () => {
    if (!bookingForm.employee_id || !bookingForm.start_date) {
        alert("Please select an employee and start date.");
        return;
    }

    if (!bookingForm.is_indefinite && !bookingForm.end_date) {
        alert("Please select an end date or choose 'Indefinite'.");
        return;
    }

    const finalEndDate = bookingForm.is_indefinite ? '9999-12-31' : bookingForm.end_date;

    if (finalEndDate < bookingForm.start_date) {
        alert("Error: End Date cannot be before Start Date.");
        return;
    }

    try {
      const { data: conflicts, error: conflictError } = await supabase
        .from('bookings')
        .select('id')
        .eq('spot_id', targetSpot.id)
        .lte('booking_start', finalEndDate)
        .gte('booking_end', bookingForm.start_date);

      if (conflictError) throw conflictError;

      if (conflicts && conflicts.length > 0) {
        alert(`❌ Spot occupied during selected dates.`);
        return;
      }

      const selectedEmp = employees.find(e => e.id === bookingForm.employee_id);
      const licensePlate = selectedEmp?.license_plate || '-';

      const newBooking = {
        spot_id: targetSpot.id,
        employee_id: bookingForm.employee_id,
        license_plate_used: licensePlate,
        booking_start: bookingForm.start_date,
        booking_end: finalEndDate,
        status: 'confirmed'
      };

      const { error } = await supabase.from('bookings').insert([newBooking]);
      if (error) throw error;

      alert("Booking Successful!");
      setIsModalOpen(false);
      fetchData(); 

    } catch (error) {
      alert("Error booking: " + error.message);
    }
  };

  const canEdit = role === 'admin' || role === 'master_admin';
  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-GB') : '-';

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* HEADER & FILTERS */}
      <div className="flex flex-col gap-4">
        <h2 className="text-2xl font-bold text-[#002D72]">Booking Management</h2>
        
        <div className="flex flex-wrap gap-4 items-center bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 border-r pr-4 mr-2">
                <span className="text-sm font-bold text-gray-500">Date:</span>
                <div className="flex items-center bg-gray-50 px-3 py-2 rounded-lg border">
                    <Calendar size={18} className="text-[#FA4786] mr-2"/>
                    <input 
                        type="date" 
                        className="bg-transparent outline-none text-[#002D72] font-medium cursor-pointer"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                    />
                </div>
            </div>

            <div className="flex items-center gap-2">
                <Filter size={16} className="text-gray-400"/>
                <span className="text-sm text-gray-600">Zone:</span>
                <select 
                    className="bg-gray-50 border rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#FA4786]"
                    value={filterZone}
                    onChange={(e) => setFilterZone(e.target.value)}
                >
                    {uniqueZones.map(z => <option key={z} value={z}>{z}</option>)}
                </select>
            </div>

            <div className="flex items-center gap-2">
                <Filter size={16} className="text-gray-400"/>
                <span className="text-sm text-gray-600">Type:</span>
                <select 
                    className="bg-gray-50 border rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#FA4786]"
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                >
                    {uniqueTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
            </div>

            <div className="flex items-center gap-2">
                <Filter size={16} className="text-gray-400"/>
                <span className="text-sm text-gray-600">Status:</span>
                <select 
                    className="bg-gray-50 border rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#FA4786]"
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                >
                    <option value="All">All Status</option>
                    <option value="Occupied">Occupied (จอง)</option>
                    <option value="Available">Available (ว่าง)</option>
                </select>
            </div>
        </div>
      </div>

      {/* TABLE */}
      <Card>
        {loading ? <div className="p-12 text-center text-gray-400">Loading...</div> : (
            <div className="overflow-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-[#002D72] text-white">
                    <tr>
                        <th className="py-3 px-4 rounded-tl-xl">Lot ID</th>
                        <th className="py-3 px-4">Zone</th>
                        <th className="py-3 px-4">Type</th>
                        <th className="py-3 px-4">Current Employee</th>
                        <th className="py-3 px-4">License Plate</th>
                        <th className="py-3 px-4">Start Date</th>
                        <th className="py-3 px-4">Current End</th>
                        <th className="py-3 px-4">Next Booking</th>
                        <th className="py-3 px-4 text-center">Status</th>
                        <th className="py-3 px-4 rounded-tr-xl text-center">Action</th>
                    </tr>
                </thead>
                <tbody>
                    {processedSpots.length === 0 && <tr><td colSpan="10" className="p-8 text-center text-gray-400">No spots found matching filters.</td></tr>}
                    
                    {processedSpots.map((spot) => {
                        const isOccupied = spot.status === 'Occupied';
                        const booking = spot.activeBooking;
                        const next = spot.nextBooking;

                        return (
                            <tr key={spot.id} className="border-b last:border-0 hover:bg-gray-50 transition">
                                <td className="py-3 px-4 font-bold text-[#002D72]">
                                    {spot.lot_id || `${spot.lot_code} ${spot.spot_number}`}
                                </td>
                                <td className="py-3 px-4">{spot.zone_text}</td>
                                <td className="py-3 px-4">
                                    <span className={`px-2 py-1 rounded text-xs border ${spot.spot_type.includes('EV') ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                                        {spot.spot_type}
                                    </span>
                                </td>
                                <td className="py-3 px-4 font-mono text-[#002D72] font-medium bg-gray-50/50">
                                    {booking ? booking.employees?.employee_code : '-'}
                                </td>
                                <td className="py-3 px-4 font-medium text-gray-700">
                                    {booking ? booking.employees?.license_plate : '-'}
                                </td>
                                <td className="py-3 px-4 text-gray-600">
                                    {booking ? formatDate(booking.booking_start) : '-'}
                                </td>
                                <td className="py-3 px-4 text-gray-600">
                                    {booking ? (
                                        <span className={booking.booking_end.startsWith('9999') ? 'text-blue-600 font-bold' : ''}>
                                            {booking.booking_end.startsWith('9999') ? 'Indefinite' : formatDate(booking.booking_end)}
                                        </span>
                                    ) : '-'}
                                </td>
                                <td className="py-3 px-4 text-gray-500">
                                    {next ? (
                                        <div className="flex flex-col text-xs">
                                            <span className="font-bold text-[#FA4786]">{formatDate(next.booking_start)}</span>
                                            <span>({next.employees?.employee_code})</span>
                                        </div>
                                    ) : <span className="text-gray-300">-</span>}
                                </td>
                                <td className="py-3 px-4 text-center">
                                    {isOccupied ? (
                                        <span className="inline-flex items-center gap-1 bg-red-100 text-red-600 px-3 py-1 rounded-full text-xs font-bold border border-red-200">
                                            <AlertCircle size={12}/> Occupied
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold border border-green-200">
                                            <CheckCircle size={12}/> Available
                                        </span>
                                    )}
                                </td>
                                <td className="py-3 px-4 text-center">
                                    {canEdit ? (
                                        <button 
                                            onClick={() => openBookingModal(spot)}
                                            className="p-2 rounded-lg text-gray-500 hover:text-[#FA4786] hover:bg-pink-50 border border-transparent hover:border-pink-200 transition"
                                            title="Edit Booking"
                                        >
                                            <SquarePen size={18} />
                                        </button>
                                    ) : <span className="text-gray-300 text-xs italic">View Only</span>}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
                </table>
            </div>
        )}
      </Card>

      {/* --- BOOKING MODAL --- */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title={`Manage Booking: ${targetSpot?.lot_id || 'Spot'}`}
        onSave={handleBookingSave}
        saveLabel="Booking"
        cancelLabel="Cancel" 
      >
        <div className="space-y-5 p-1">
            
            {/* SEARCHABLE EMPLOYEE FIELD */}
            <div>
                <label className="block text-sm font-bold text-[#002D72] mb-1">Select Employee</label>
                
                <div className="relative mb-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input 
                        type="text" 
                        placeholder="Search by Code or Name..." 
                        className="w-full border border-gray-300 rounded-xl pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#FA4786]"
                        value={empSearch}
                        onChange={(e) => setEmpSearch(e.target.value)}
                    />
                </div>

                <select 
                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-[#FA4786] bg-white"
                    value={bookingForm.employee_id}
                    onChange={(e) => setBookingForm({...bookingForm, employee_id: e.target.value})}
                    size={filteredEmployees.length > 5 ? 5 : 1}
                >
                    <option value="">-- Click to Select --</option>
                    {filteredEmployees.map(emp => (
                        <option key={emp.id} value={emp.id}>
                            {emp.employee_code} - {emp.full_name}
                        </option>
                    ))}
                    {filteredEmployees.length === 0 && <option disabled>No employees found</option>}
                </select>
                
                {empSearch && (
                    <p className="text-xs text-gray-400 mt-1 text-right">
                        Found {filteredEmployees.length} result(s)
                    </p>
                )}
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-bold text-[#002D72] mb-1">Start Date</label>
                    <input 
                        type="date" 
                        className="w-full border border-gray-300 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-[#FA4786]"
                        value={bookingForm.start_date}
                        onChange={(e) => setBookingForm({...bookingForm, start_date: e.target.value})}
                    />
                </div>

                <div>
                    <label className="block text-sm font-bold text-[#002D72] mb-1">End Date</label>
                    <input 
                        type="date" 
                        className={`w-full border border-gray-300 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-[#FA4786] ${bookingForm.is_indefinite ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : ''}`}
                        value={bookingForm.end_date}
                        /* --- ADDED LOGIC HERE --- */
                        min={bookingForm.start_date}
                        /* ------------------------ */
                        onChange={(e) => setBookingForm({...bookingForm, end_date: e.target.value})}
                        disabled={bookingForm.is_indefinite}
                    />
                    
                    <div className="mt-2 flex items-center gap-2">
                        <input 
                            type="checkbox" 
                            id="indefinite"
                            className="w-4 h-4 accent-[#FA4786] cursor-pointer"
                            checked={bookingForm.is_indefinite}
                            onChange={(e) => setBookingForm({...bookingForm, is_indefinite: e.target.checked})}
                        />
                        <label htmlFor="indefinite" className="text-sm text-gray-600 cursor-pointer select-none">
                            Indefinite
                        </label>
                    </div>
                </div>
            </div>
        </div>
      </Modal>

    </div>
  );
}