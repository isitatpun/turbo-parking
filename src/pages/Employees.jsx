import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Card, Modal, Badge } from '../components/UI';
import { Plus, Edit2, Trash2, Car, Search, Building2, User, X } from 'lucide-react';

export default function Employees() {
  // --- Main Data State ---
  const [records, setRecords] = useState([]); // Grouped by Employee
  const [loading, setLoading] = useState(true);
  const [mainFilter, setMainFilter] = useState('');

  // --- Modal & Form State ---
  const [modalOpen, setModalOpen] = useState(false);
  const [searchCentralTerm, setSearchCentralTerm] = useState('');
  const [centralResults, setCentralResults] = useState([]);
  const [isSearchingCentral, setIsSearchingCentral] = useState(false);
   
  const [selectedEmployee, setSelectedEmployee] = useState(null); 
  
  // Changed: Array for multiple plates (Max 5)
  const [inputPlates, setInputPlates] = useState(['']); 

  useEffect(() => {
    fetchData();
  }, []);

  // --- 1. FETCH & JOIN DATA (GROUPED) ---
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

      // B. Extract unique Employee Codes
      const employeeCodes = [...new Set(vehicleData.map(v => v.employee_code))];

      // C. Fetch details from Central Table
      const { data: centralData, error: centralError } = await supabase
        .from('central_employee_from_databrick')
        .select('employee_code, full_name_eng, division_name, department_name, pos_level')
        .in('employee_code', employeeCodes);

      if (centralError) throw centralError;

      // D. Group Vehicles by Employee Code (1 Employee = 1 Row)
      const groupedMap = new Map();

      vehicleData.forEach(vehicle => {
        if (!groupedMap.has(vehicle.employee_code)) {
            // Find employee details once
            const empDetails = centralData.find(c => c.employee_code === vehicle.employee_code);
            groupedMap.set(vehicle.employee_code, {
                employee_code: vehicle.employee_code,
                full_name_eng: empDetails?.full_name_eng || 'Unknown',
                division_name: empDetails?.division_name || '-',
                department_name: empDetails?.department_name || '-',
                pos_level: empDetails?.pos_level || '-',
                vehicles: [] // Array to hold multiple plates
            });
        }
        // Push vehicle info into the array
        groupedMap.get(vehicle.employee_code).vehicles.push({
            id: vehicle.id,
            license_plate: vehicle.license_plate
        });
      });

      // Convert Map to Array
      setRecords(Array.from(groupedMap.values()));

    } catch (error) {
      console.error("Error fetching data:", error);
      alert("Error loading data");
    } finally {
      setLoading(false);
    }
  };

  // --- 2. SEARCH CENTRAL DATABASE ---
  const handleSearchCentral = async (term) => {
    setSearchCentralTerm(term);
    if (term.length < 3) return; 

    setIsSearchingCentral(true);
    try {
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

  // --- 3. INPUT HANDLERS (Multiple Plates) ---
  const handleAddPlateInput = () => {
    if (inputPlates.length < 5) {
      setInputPlates([...inputPlates, '']);
    }
  };

  const handleRemovePlateInput = (index) => {
    const newPlates = [...inputPlates];
    newPlates.splice(index, 1);
    setInputPlates(newPlates);
  };

  const handlePlateChange = (index, value) => {
    const newPlates = [...inputPlates];
    // Remove spacebar immediately and uppercase
    newPlates[index] = value.replace(/\s/g, '').toUpperCase();
    setInputPlates(newPlates);
  };

  // --- 4. CRUD ACTIONS ---
  const handleOpenAdd = () => {
    setSelectedEmployee(null);
    setSearchCentralTerm('');
    setCentralResults([]);
    setInputPlates(['']); // Reset to 1 empty input
    setModalOpen(true);
  };

  // Opens modal to Add more plates to existing employee
  const handleOpenEdit = (record) => {
    setSelectedEmployee({
      employee_code: record.employee_code,
      full_name_eng: record.full_name_eng,
      division_name: record.division_name,
      department_name: record.department_name,
      pos_level: record.pos_level
    });
    setInputPlates(['']); // Start with a blank line to add new
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!selectedEmployee) {
      alert("Please select an employee.");
      return;
    }

    // Filter out empty inputs
    const validPlates = inputPlates.filter(p => p.trim().length > 0);

    if (validPlates.length === 0) {
      alert("Please enter at least one license plate.");
      return;
    }

    try {
      // Create an array of rows to insert (Supabase requires 1 row per vehicle)
      const payload = validPlates.map(plate => ({
        employee_code: selectedEmployee.employee_code,
        license_plate: plate,
        is_active: true
      }));

      const { error } = await supabase
        .from('employee_vehicles')
        .insert(payload);

      if (error) throw error;

      setModalOpen(false);
      fetchData();
    } catch (error) {
      alert("Error saving: " + error.message);
    }
  };

  // Individual delete of a specific vehicle ID
  const handleDeleteVehicle = async (vehicleId) => {
    if (!confirm("Remove this license plate?")) return;
    try {
      const { error } = await supabase
        .from('employee_vehicles')
        .update({ is_active: false })
        .eq('id', vehicleId);

      if (error) throw error;
      fetchData();
    } catch (error) {
      alert("Error deleting: " + error.message);
    }
  };

  // --- 5. FILTERING MAIN TABLE ---
  const filteredRecords = records.filter(r => {
    const term = mainFilter.toLowerCase();
    const platesString = r.vehicles.map(v => v.license_plate).join(' ').toLowerCase();
    
    return (
      r.full_name_eng?.toLowerCase().includes(term) ||
      r.employee_code?.toLowerCase().includes(term) ||
      r.division_name?.toLowerCase().includes(term) ||
      platesString.includes(term)
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
          placeholder="Filter by Name, Code, Division or Plate Number..." 
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
                  {/* Changed Header to Position Level */}
                  <th className="py-3 px-4">Position Level</th>
                  <th className="py-3 px-4">License Plate(s)</th>
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
                  <tr key={rec.employee_code} className="border-b hover:bg-gray-50 transition align-top">
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

                    {/* Position Level Column - Simplified */}
                    <td className="py-3 px-4">
                       <span className="text-sm font-medium text-gray-700">{rec.pos_level}</span>
                    </td>

                    {/* Plate Column - Minimal Apple Style - Multiple Items */}
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-2">
                        {rec.vehicles.map((v) => (
                           <div key={v.id} className="group relative bg-white border border-gray-200 text-gray-800 text-sm font-semibold px-3 py-1 rounded-full shadow-sm flex items-center gap-2 hover:border-[#FA4786] transition-colors cursor-default">
                              <span className="text-xs text-gray-400">TH</span>
                              {v.license_plate}
                              {/* Quick Delete X on hover */}
                              <button 
                                onClick={() => handleDeleteVehicle(v.id)}
                                className="ml-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X size={14} />
                              </button>
                           </div>
                        ))}
                      </div>
                    </td>

                    {/* Action Column */}
                    <td className="py-3 px-4 text-right">
                       {/* Opens modal pre-filled to add MORE plates */}
                       <button onClick={() => handleOpenEdit(rec)} className="text-blue-600 hover:bg-blue-50 p-2 rounded-lg transition" title="Add another plate">
                          <Edit2 size={16}/>
                       </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* MODAL: ADD PLATES */}
      <Modal 
        isOpen={modalOpen} 
        onClose={() => setModalOpen(false)} 
        title="Register Vehicles"
        onSave={handleSave}
        saveLabel="Save Records"
      >
        <div className="space-y-6">
          
          {/* 1. EMPLOYEE SELECTION */}
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
            <label className="block text-sm font-bold text-[#002D72] mb-2 flex items-center gap-2">
              <User size={16}/> Employee Selection
            </label>
            
            {selectedEmployee ? (
              <div className="bg-white p-3 rounded-lg border shadow-sm flex justify-between items-center">
                <div>
                  <div className="font-bold text-gray-800">{selectedEmployee.full_name_eng}</div>
                  <div className="text-xs text-gray-500 font-mono">{selectedEmployee.employee_code} | {selectedEmployee.division_name}</div>
                </div>
                {/* Allow changing employee only if creating fresh, not editing existing row */}
                {inputPlates.length === 1 && records.every(r => r.employee_code !== selectedEmployee.employee_code) && (
                   <button 
                     onClick={() => setSelectedEmployee(null)} 
                     className="text-xs text-red-500 hover:underline"
                   >
                     Change
                   </button>
                )}
              </div>
            ) : (
              <div className="relative">
                <input 
                  type="text"
                  placeholder="Search by Code or English Name (min 3 chars)..."
                  className="w-full border rounded-lg p-2 pl-9 focus:ring-2 focus:ring-[#FA4786] outline-none"
                  value={searchCentralTerm}
                  onChange={(e) => handleSearchCentral(e.target.value)}
                />
                <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
                
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

          {/* 2. LICENSE PLATE INPUTS (Dynamic List) */}
          <div>
            <label className="block text-sm font-bold text-[#002D72] mb-2 flex items-center justify-between">
              <span className="flex items-center gap-2"><Car size={16}/> License Plate(s)</span>
              <span className="text-xs font-normal text-gray-400">Max 5 per submission</span>
            </label>
            
            <div className="space-y-3">
                {inputPlates.map((plate, index) => (
                    <div key={index} className="flex gap-2">
                        <input 
                          type="text"
                          placeholder="e.g. 1ฏฏ1234"
                          className="flex-1 border-2 border-gray-200 rounded-xl p-3 text-lg font-bold text-gray-700 focus:border-[#FA4786] outline-none uppercase tracking-widest placeholder:tracking-normal placeholder:font-normal"
                          value={plate}
                          onChange={(e) => handlePlateChange(index, e.target.value)}
                        />
                        {inputPlates.length > 1 && (
                            <button 
                                onClick={() => handleRemovePlateInput(index)}
                                className="p-3 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition"
                            >
                                <Trash2 size={20} />
                            </button>
                        )}
                    </div>
                ))}
            </div>

            {inputPlates.length < 5 && (
                <button 
                    onClick={handleAddPlateInput}
                    className="mt-3 text-sm text-[#FA4786] font-medium flex items-center gap-1 hover:underline"
                >
                    <Plus size={16} /> Add another plate
                </button>
            )}
             <p className="text-xs text-gray-400 mt-2">
               Spacebars are automatically removed. Format is auto-adjusted.
             </p>
          </div>

        </div>
      </Modal>
    </div>
  );
}