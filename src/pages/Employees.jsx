import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Card, Modal, Badge } from '../components/UI';
import { Plus, Edit2, Trash2, Car, Search, Building2, User } from 'lucide-react';

export default function Employees() {
  // --- Main Data State ---
  const [records, setRecords] = useState([]); // Joined data (Vehicles + Central Info)
  const [loading, setLoading] = useState(true);
  const [mainFilter, setMainFilter] = useState(''); // Search bar for the main table

  // --- Modal & Form State ---
  const [modalOpen, setModalOpen] = useState(false);
  const [searchCentralTerm, setSearchCentralTerm] = useState('');
  const [centralResults, setCentralResults] = useState([]);
  const [isSearchingCentral, setIsSearchingCentral] = useState(false);
  
  const [selectedEmployee, setSelectedEmployee] = useState(null); // The employee selected from search
  const [licensePlate, setLicensePlate] = useState('');
  const [editingId, setEditingId] = useState(null); // ID of the employee_vehicles row being edited

  useEffect(() => {
    fetchData();
  }, []);

  // --- 1. FETCH & JOIN DATA ---
  const fetchData = async () => {
    try {
      setLoading(true);

      // A. Get all active vehicles
      const { data: vehicleData, error: vehicleError } = await supabase
        .from('employee_vehicles')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (vehicleError) throw vehicleError;
      if (!vehicleData || vehicleData.length === 0) {
        setRecords([]);
        setLoading(false);
        return;
      }

      // B. Extract unique Employee Codes to fetch details
      const employeeCodes = [...new Set(vehicleData.map(v => v.employee_code))];

      // C. Fetch details from Central Table
      const { data: centralData, error: centralError } = await supabase
        .from('central_employee_from_databrick')
        .select('employee_code, full_name_eng, division_name, department_name, pos_level')
        .in('employee_code', employeeCodes);

      if (centralError) throw centralError;

      // D. Join Data in Memory
      const joinedData = vehicleData.map(vehicle => {
        const empDetails = centralData.find(c => c.employee_code === vehicle.employee_code);
        return {
          id: vehicle.id, // employee_vehicles ID
          license_plate: vehicle.license_plate,
          employee_code: vehicle.employee_code,
          // Fallbacks if central data is missing
          full_name_eng: empDetails?.full_name_eng || 'Unknown',
          division_name: empDetails?.division_name || '-',
          department_name: empDetails?.department_name || '-',
          pos_level: empDetails?.pos_level || '-',
          derived_type: mapPosLevelToType(empDetails?.pos_level)
        };
      });

      setRecords(joinedData);

    } catch (error) {
      console.error("Error fetching data:", error);
      alert("Error loading data");
    } finally {
      setLoading(false);
    }
  };

  // --- HELPER: Position Level to Type Mapping ---
  // Adjust this logic based on your actual business rules for "Management" vs "General"
  const mapPosLevelToType = (posLevel) => {
    if (!posLevel) return 'General';
    const upperPos = posLevel.toUpperCase();
    // Example Logic: specific keywords imply Management
    if (['AVP', 'VP', 'SVP', 'EVP', 'C-LEVEL', 'DIRECTOR', 'MANAGER'].some(role => upperPos.includes(role))) {
      return 'Management';
    }
    return 'General';
  };

  // --- 2. SEARCH CENTRAL DATABASE (For Modal) ---
  const handleSearchCentral = async (term) => {
    setSearchCentralTerm(term);
    if (term.length < 3) return; // Prevent searching on empty or short string

    setIsSearchingCentral(true);
    try {
      // Search by Code OR Name
      const { data, error } = await supabase
        .from('central_employee_from_databrick')
        .select('employee_code, full_name_eng, division_name, department_name, pos_level')
        .or(`employee_code.ilike.%${term}%,full_name_eng.ilike.%${term}%`)
        .limit(5);

      if (error) throw error;
      setCentralResults(data || []);
    } catch (error) {
      console.error(error);
    } finally {
      setIsSearchingCentral(false);
    }
  };

  // --- 3. CRUD ACTIONS ---
  
  const handleOpenAdd = () => {
    setEditingId(null);
    setSelectedEmployee(null);
    setSearchCentralTerm('');
    setCentralResults([]);
    setLicensePlate('');
    setModalOpen(true);
  };

  const handleOpenEdit = (record) => {
    setEditingId(record.id);
    // Pre-fill data structure as if selected from search
    setSelectedEmployee({
      employee_code: record.employee_code,
      full_name_eng: record.full_name_eng,
      division_name: record.division_name,
      department_name: record.department_name,
      pos_level: record.pos_level
    });
    setLicensePlate(record.license_plate);
    setSearchCentralTerm(''); // Reset search
    setCentralResults([]);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!selectedEmployee || !licensePlate) {
      alert("Please select an employee and enter a license plate.");
      return;
    }

    try {
      const payload = {
        employee_code: selectedEmployee.employee_code,
        license_plate: licensePlate.toUpperCase(),
        is_active: true
      };

      if (editingId) {
        // UPDATE existing vehicle entry
        const { error } = await supabase
          .from('employee_vehicles')
          .update({ license_plate: payload.license_plate }) // usually only plate changes
          .eq('id', editingId);
        if (error) throw error;
      } else {
        // INSERT new vehicle entry
        const { error } = await supabase
          .from('employee_vehicles')
          .insert([payload]);
        if (error) throw error;
      }

      setModalOpen(false);
      fetchData();
    } catch (error) {
      alert("Error saving: " + error.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Are you sure you want to remove this license plate entry?")) return;
    try {
      const { error } = await supabase
        .from('employee_vehicles')
        .update({ is_active: false })
        .eq('id', id);

      if (error) throw error;
      fetchData();
    } catch (error) {
      alert("Error deleting: " + error.message);
    }
  };

  // --- 4. FILTERING MAIN TABLE ---
  const filteredRecords = records.filter(r => {
    const term = mainFilter.toLowerCase();
    return (
      r.full_name_eng?.toLowerCase().includes(term) ||
      r.employee_code?.toLowerCase().includes(term) ||
      r.division_name?.toLowerCase().includes(term) ||
      r.department_name?.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[#002D72]">Registered Vehicles</h2>
          <p className="text-gray-500 text-sm">Manage employee license plates linked to Central Database.</p>
        </div>
        <button 
          onClick={handleOpenAdd} 
          className="bg-[#FA4786] text-white px-4 py-2 rounded-xl flex items-center gap-2 hover:bg-pink-600 shadow-lg transition"
        >
          <Plus size={18} /> Add License Plate
        </button>
      </div>

      {/* FILTER BAR */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 text-gray-400" size={20} />
        <input 
          type="text" 
          placeholder="Filter by Name, Code, Division or Department..." 
          className="w-full pl-10 pr-4 py-2 border rounded-xl focus:ring-2 focus:ring-[#002D72] outline-none"
          value={mainFilter}
          onChange={(e) => setMainFilter(e.target.value)}
        />
      </div>

      {/* MAIN TABLE */}
      <Card>
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading records...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50 border-b text-gray-600">
                <tr>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Org Info</th>
                  <th className="py-3 px-4">Type (Pos)</th>
                  <th className="py-3 px-4">License Plate</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.length === 0 && (
                  <tr>
                    <td colSpan="5" className="p-6 text-center text-gray-400">
                      No matching records found.
                    </td>
                  </tr>
                )}
                {filteredRecords.map((rec) => (
                  <tr key={rec.id} className="border-b hover:bg-gray-50 transition">
                    {/* Employee Column */}
                    <td className="py-3 px-4">
                      <div className="font-bold text-[#002D72]">{rec.full_name_eng}</div>
                      <div className="text-xs font-mono text-gray-500 bg-gray-100 inline-block px-1 rounded">
                        {rec.employee_code}
                      </div>
                    </td>

                    {/* Org Column */}
                    <td className="py-3 px-4 text-sm text-gray-600">
                      <div className="flex items-center gap-1">
                        <Building2 size={14} /> {rec.division_name}
                      </div>
                      <div className="text-gray-400 pl-5 text-xs">{rec.department_name}</div>
                    </td>

                    {/* Type Column */}
                    <td className="py-3 px-4">
                      <div className="flex flex-col items-start gap-1">
                        <Badge color={rec.derived_type === 'Management' ? 'purple' : 'blue'}>
                          {rec.derived_type}
                        </Badge>
                        <span className="text-[10px] text-gray-400 uppercase tracking-wider">{rec.pos_level}</span>
                      </div>
                    </td>

                    {/* Plate Column */}
                    <td className="py-3 px-4">
                      <div className="bg-white border-2 border-gray-800 text-gray-900 font-bold px-3 py-1 rounded-md inline-flex items-center gap-2 shadow-sm">
                        <Car size={16} className="text-gray-400" />
                        {rec.license_plate}
                      </div>
                    </td>

                    {/* Action Column */}
                    <td className="py-3 px-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => handleOpenEdit(rec)} className="text-blue-600 hover:bg-blue-50 p-2 rounded-lg transition">
                          <Edit2 size={16}/>
                        </button>
                        <button onClick={() => handleDelete(rec.id)} className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition">
                          <Trash2 size={16}/>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* MODAL: ADD / EDIT */}
      <Modal 
        isOpen={modalOpen} 
        onClose={() => setModalOpen(false)} 
        title={editingId ? "Edit Vehicle Info" : "Add License Plate"}
        onSave={handleSave}
        saveLabel="Save Record"
      >
        <div className="space-y-6">
          
          {/* 1. EMPLOYEE SELECTION (Search or Display) */}
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
            <label className="block text-sm font-bold text-[#002D72] mb-2 flex items-center gap-2">
              <User size={16}/> Employee Selection
            </label>
            
            {/* If Edit Mode or Employee Selected, Show Card */}
            {selectedEmployee ? (
              <div className="bg-white p-3 rounded-lg border shadow-sm flex justify-between items-center">
                <div>
                  <div className="font-bold text-gray-800">{selectedEmployee.full_name_eng}</div>
                  <div className="text-xs text-gray-500 font-mono">{selectedEmployee.employee_code} | {selectedEmployee.division_name}</div>
                  <div className="text-xs text-blue-600 font-medium mt-1">Level: {selectedEmployee.pos_level}</div>
                </div>
                {!editingId && (
                   <button 
                     onClick={() => setSelectedEmployee(null)} 
                     className="text-xs text-red-500 hover:underline"
                   >
                     Change
                   </button>
                )}
              </div>
            ) : (
              /* Search Input */
              <div className="relative">
                <input 
                  type="text"
                  placeholder="Search by Code or English Name (min 3 chars)..."
                  className="w-full border rounded-lg p-2 pl-9 focus:ring-2 focus:ring-[#FA4786] outline-none"
                  value={searchCentralTerm}
                  onChange={(e) => handleSearchCentral(e.target.value)}
                />
                <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
                
                {/* Search Results Dropdown */}
                {centralResults.length > 0 && (
                   <div className="absolute z-10 w-full bg-white border mt-1 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                     {centralResults.map((res) => (
                       <div 
                         key={res.employee_code} 
                         onClick={() => {
                           setSelectedEmployee(res);
                           setCentralResults([]);
                           setSearchCentralTerm('');
                         }}
                         className="p-3 hover:bg-gray-50 cursor-pointer border-b last:border-0"
                       >
                         <div className="font-medium text-sm text-[#002D72]">{res.full_name_eng}</div>
                         <div className="flex justify-between text-xs text-gray-500 mt-1">
                            <span>{res.employee_code}</span>
                            <span>{res.division_name}</span>
                         </div>
                       </div>
                     ))}
                   </div>
                )}
                {isSearchingCentral && <div className="text-xs text-gray-400 mt-1 pl-2">Searching...</div>}
              </div>
            )}
          </div>

          {/* 2. LICENSE PLATE INPUT */}
          <div>
            <label className="block text-sm font-bold text-[#002D72] mb-2 flex items-center gap-2">
              <Car size={16}/> License Plate
            </label>
            <input 
              type="text"
              placeholder="e.g. 1AB-1234"
              className="w-full border-2 border-gray-200 rounded-xl p-3 text-lg font-bold text-gray-700 focus:border-[#FA4786] outline-none uppercase"
              value={licensePlate}
              onChange={(e) => setLicensePlate(e.target.value)}
            />
            <p className="text-xs text-gray-400 mt-1">
              Enter the vehicle registration number.
            </p>
          </div>

        </div>
      </Modal>
    </div>
  );
}