import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Card, Badge, Modal } from '../components/UI';
import { Calendar, SquarePen, Filter, CheckCircle, AlertCircle, Search, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Booking() {
  const { role } = useAuth();

  // --- STATE ---
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  
  const [spots, setSpots] = useState([]);
  const [bookings, setBookings] = useState([]); 
  const [employees, setEmployees] = useState([]);
  const [vehicles, setVehicles] = useState({}); // Map: emp_code -> "plate1, plate2"
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
    employee_code: '', // Helper to find vehicle
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

      // 1. Fetch Spots
      const { data: spotsData, error: spotsError } = await supabase
        .from('parking_spots')
        .select('*')
        .eq('is_active', true)
        .order('lot_id', { ascending: true });

      if (spotsError) throw spotsError;

      // 2. Fetch Employees (New Table Structure)
      const { data: empData, error: empError } = await supabase
        .from('central_employee_from_databrick')
        .select('employee_id, employee_code, full_name_eng, pos_level, start_date, resignation_effective_date');

      if (empError) throw empError;

      // 3. Fetch Vehicles (for License Plates)
      const { data: vehData, error: vehError } = await supabase
        .from('employee_vehicles')
        .select('employee_code, license_plate')
        .eq('is_active', true);

      if (vehError) throw vehError;

      // Create Vehicle Map (Handle multiple plates per employee)
      const vMap = {};
      vehData?.forEach(v => {
        if (v.employee_code) {
          if (vMap[v.employee_code]) {
            // Append with comma if already exists
            vMap[v.employee_code] = `${vMap[v.employee_code]}, ${v.license_plate}`;
          } else {
            // Initialize
            vMap[v.employee_code] = v.license_plate;
          }
        }
      });
      setVehicles(vMap);

      // 4. Fetch Bookings
      const { data: bookingData, error: bookingError } = await supabase
        .from('bookings')
        .select(`
          *,
          central_employee_from_databrick (
            employee_code,
            full_name_eng,
            pos_level
          )
        `)
        .gte('booking_end', selectedDate)
        .eq('is_deleted', false);

      if (bookingError) throw bookingError;

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
  
  // Strict usage of spot_type from parking_spots for the filter
  const uniqueTypes = ['All', ...new Set(spots.map(s => s.spot_type))].sort();

  const processedSpots = spots.map(spot => {
    // Find active booking for this spot on the selected date
    const activeBooking = bookings.find(b => 
        b.spot_id === spot.id && // Ensure mapping via spot_id (FK)
        b.booking_start <= selectedDate && 
        b.booking_end >= selectedDate
    );

    // Logic to find the NEXT booking (future)
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

  // --- 3. FILTER EMPLOYEES (Modal Search) ---
  const filteredEmployees = employees.filter(emp => {
    // 1. Search Logic
    const matchesSearch = (emp.employee_code || '').toLowerCase().includes(empSearch.toLowerCase()) || 
                          (emp.full_name_eng || '').toLowerCase().includes(empSearch.toLowerCase());
    
    // 2. REQUIREMENT: Must have license plate
    // We check if the employee code exists in our vehicle map
    const hasLicensePlate = !!vehicles[emp.employee_code];

    return matchesSearch && hasLicensePlate;
  });

  // --- 4. ACTIONS ---
  const openBookingModal = (spot) => {
    setTargetSpot(spot);
    setEmpSearch(''); 
    setBookingForm({
        employee_id: '',
        employee_code: '',
        start_date: selectedDate, 
        end_date: '',
        is_indefinite: false
    });
    setIsModalOpen(true);
  };

  const handleBookingSave = async () => {
    // Basic Validation
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

    // --- WARNING ONLY: Check Contract Dates ---
    const selectedEmp = employees.find(e => e.employee_id === bookingForm.employee_id);
    
    if (selectedEmp) {
      const contractEnd = selectedEmp.resignation_effective_date;
      
      if (contractEnd && !bookingForm.is_indefinite && new Date(finalEndDate) > new Date(contractEnd)) {
        const confirm = window.confirm(`Warning: Booking ends after employee resignation (${contractEnd}). Continue?`);
        if (!confirm) return;
      }
    }

    try {
      // 1. Check for Spot Conflicts (Existing Logic)
      const { data: conflicts, error: conflictError } = await supabase
        .from('bookings')
        .select('id')
        .eq('spot_id', targetSpot.id) // check current spot
        .eq('is_deleted', false) 
        .lte('booking_start', finalEndDate)
        .gte('booking_end', bookingForm.start_date);

      if (conflictError) throw conflictError;

      if (conflicts && conflicts.length > 0) {
        alert(`❌ Spot occupied during selected dates.`);
        return;
      }

      // 2. REQUIREMENT: Check if Employee already has ANY booking in this interval
      // 1 Employee can book only 1 lot_id in same interval day
      const { data: userConflicts, error: userError } = await supabase
        .from('bookings')
        .select('id')
        .eq('employee_id', bookingForm.employee_id)
        .eq('is_deleted', false)
        // Check for Date Overlap: (StartA <= EndB) and (EndA >= StartB)
        .lte('booking_start', finalEndDate)
        .gte('booking_end', bookingForm.start_date);

      if (userError) throw userError;

      if (userConflicts && userConflicts.length > 0) {
        alert(`❌ This employee already has a booking for another spot during this period.`);
        return;
      }

      // License Plate Lookup (Uses the comma separated string if multiple exist)
      const licensePlate = vehicles[bookingForm.employee_code] || '-';

      const newBooking = {
        spot_id: targetSpot.id, // Ensure this matches FK in bookings table
        employee_id: bookingForm.employee_id, // Ensure this matches FK type (text/uuid)
        license_plate_used: licensePlate,
        booking_start: bookingForm.start_date,
        booking_end: finalEndDate,
        status: 'confirmed',
        is_deleted: false
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
        {loading ? <div className="p-12 text-center text-gray-400">Loading data...</div> : (
            <div className="overflow-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-[#002D72] text-white">
                    <tr>
                        <th className="py-3 px-4 rounded-tl-xl text-center">Lot ID</th>
                        <th className="py-3 px-4 text-center">Zone</th>
                        <th className="py-3 px-4 text-center">Type</th>
                        <th className="py-3 px-4 text-center">Current Employee</th>
                        <th className="py-3 px-4 text-center">License Plate</th>
                        <th className="py-3 px-4 text-center">Start Date</th>
                        <th className="py-3 px-4 text-center">Current End</th>
                        <th className="py-3 px-4 text-center">Next Booking</th>
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

                        // Retrieve Employee Info from joined table
                        const empInfo = booking?.central_employee_from_databrick;

                        // License Plate logic: Use used plate -> fallback to Vehicle Map -> '-'
                        const plateDisplay = booking?.license_plate_used || vehicles[empInfo?.employee_code] || '-';

                        return (
                            <tr key={spot.id} className="border-b last:border-0 hover:bg-gray-50 transition">
                                <td className="py-3 px-4 font-bold text-[#002D72] text-center">
                                    {spot.lot_id}
                                </td>
                                <td className="py-3 px-4 text-center">{spot.zone_text}</td>
                                <td className="py-3 px-4 text-center">
                                    <span className={`px-2 py-1 rounded text-xs border ${spot.spot_type.includes('EV') ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                                        {spot.spot_type}
                                    </span>
                                </td>
                                <td className="py-3 px-4">
                                    {booking ? (
                                        <div className='flex flex-col items-center'>
                                            <span className="font-mono text-[#002D72] font-medium">{empInfo?.employee_code || '-'}</span>
                                            {empInfo?.full_name_eng && (
                                                <span className="text-xs text-gray-500 truncate max-w-[150px]">{empInfo.full_name_eng}</span>
                                            )}
                                        </div>
                                    ) : <div className="text-center">-</div>}
                                </td>
                                <td className="py-3 px-4 font-medium text-gray-700 text-center max-w-[200px] whitespace-normal">
                                    {booking ? plateDisplay : '-'}
                                </td>
                                <td className="py-3 px-4 text-gray-600 text-center">
                                    {booking ? formatDate(booking.booking_start) : '-'}
                                </td>
                                <td className="py-3 px-4 text-gray-600 text-center">
                                    {booking ? (
                                        <span className={booking.booking_end.startsWith('9999') ? 'text-blue-600 font-bold' : ''}>
                                            {booking.booking_end.startsWith('9999') ? 'Indefinite' : formatDate(booking.booking_end)}
                                        </span>
                                    ) : '-'}
                                </td>
                                <td className="py-3 px-4 text-gray-500 text-center">
                                    {next ? (
                                        <div className="flex flex-col text-xs items-center">
                                            <span className="font-bold text-[#FA4786]">{formatDate(next.booking_start)}</span>
                                            <span>({next.central_employee_from_databrick?.employee_code})</span>
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

                <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-xl bg-white">
                    {filteredEmployees.length === 0 ? (
                        <div className="p-3 text-sm text-gray-400 text-center">
                            {empSearch ? 'No matching employees with license plates found' : 'No employees with license plates available'}
                        </div>
                    ) : (
                        filteredEmployees.map(emp => {
                            const vehPlate = vehicles[emp.employee_code];
                            return (
                                <div 
                                    key={emp.employee_id} 
                                    onClick={() => setBookingForm({
                                        ...bookingForm, 
                                        employee_id: emp.employee_id,
                                        employee_code: emp.employee_code
                                    })}
                                    className={`px-3 py-2 text-sm cursor-pointer border-b last:border-0 flex justify-between items-center hover:bg-pink-50 ${bookingForm.employee_id === emp.employee_id ? 'bg-pink-50 border-l-4 border-l-[#FA4786]' : ''}`}
                                >
                                    <div>
                                        <div className="font-bold text-[#002D72]">{emp.employee_code} - {emp.full_name_eng}</div>
                                        <div className="text-xs text-gray-500 flex gap-2">
                                            <span className="bg-gray-100 px-1 rounded">{emp.pos_level || '-'}</span>
                                            {vehPlate && <span>🚗 {vehPlate}</span>}
                                        </div>
                                    </div>
                                    {bookingForm.employee_id === emp.employee_id && <CheckCircle size={16} className="text-[#FA4786]"/>}
                                </div>
                            );
                        })
                    )}
                </div>
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
                        min={bookingForm.start_date}
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