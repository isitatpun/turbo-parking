import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Card, Modal } from '../components/UI';
import { Plus, Edit2, Trash2, Car, Search, Building2, User, X, Star } from 'lucide-react'; // Added Star icon

export default function Employees() {
  // --- Main Data State ---
  const [records, setRecords] = useState([]); 
  const [loading, setLoading] = useState(true);
  const [mainFilter, setMainFilter] = useState('');

  // --- Modal & Form State ---
  const [modalOpen, setModalOpen] = useState(false);
  const [searchCentralTerm, setSearchCentralTerm] = useState('');
  const [centralResults, setCentralResults] = useState([]);
  const [isSearchingCentral, setIsSearchingCentral] = useState(false);
    
  const [selectedEmployee, setSelectedEmployee] = useState(null); 
  
  // New State for Privilege
  const [privilegeInput, setPrivilegeInput] = useState(''); // <--- NEW

  // Array for multiple plates (Max 5)
  const [inputPlates, setInputPlates] = useState(['']); 

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

      // B. Extract unique Employee Codes
      const employeeCodes = vehicleData ? [...new Set(vehicleData.map(v => v.employee_code))] : [];

      // C. Fetch details from Central Table
      const { data: centralData, error: centralError } = await supabase
        .from('central_employee_from_databrick')
        .select('employee_code, full_name_eng, division_name, department_name, pos_level')
        .in('employee_code', employeeCodes);

      if (centralError) throw centralError;

      // D. Fetch Privileges (NEW STEP) <--- NEW
      const { data: privData, error: privError } = await supabase
        .from('employee_privileges')
        .select('employee_code, privilege')
        .in('employee_code', employeeCodes);

      if (privError) throw privError;

      // E. Group Vehicles by Employee Code
      const groupedMap = new Map();

      // Helper function to get privilege safely
      const getPrivilege = (code) => {
        const found = privData?.find(p => p.employee_code === code);
        return found ? found.privilege : '';
      };

      if(vehicleData && vehicleData.length > 0) {
        vehicleData.forEach(vehicle => {
            if (!groupedMap.has(vehicle.employee_code)) {
                const empDetails = centralData?.find(c => c.employee_code === vehicle.employee_code);
                groupedMap.set(vehicle.employee_code, {
                    employee_code: vehicle.employee_code,
                    full_name_eng: empDetails?.full_name_eng || 'Unknown',
                    division_name: empDetails?.division_name || '-',
                    department_name: empDetails?.department_name || '-',
                    pos_level: empDetails?.pos_level || '-',
                    privilege: getPrivilege(vehicle.employee_code), // <--- NEW: Add privilege to record
                    vehicles: [] 
                });
            }
            groupedMap.get(vehicle.employee_code).vehicles.push({
                id: vehicle.id,
                license_plate: vehicle.license_plate
            });
          });
      }

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

  // --- 3. INPUT HANDLERS ---
  const handleAddPlateInput = () => {
    if (inputPlates.length < 5) setInputPlates([...inputPlates, '']);
  };

  const handleRemovePlateInput = (index) => {
    const newPlates = [...inputPlates];
    newPlates.splice(index, 1);
    setInputPlates(newPlates);
  };

  const handlePlateChange = (index, value) => {
    const newPlates = [...inputPlates];
    newPlates[index] = value.replace(/\s/g, '').toUpperCase();
    setInputPlates(newPlates);
  };

  // --- 4. CRUD ACTIONS ---
  const handleOpenAdd = () => {
    setSelectedEmployee(null);
    setSearchCentralTerm('');
    setCentralResults([]);
    setInputPlates(['']); 
    setPrivilegeInput(''); // Reset privilege <--- NEW
    setModalOpen(true);
  };

  const handleOpenEdit = async (record) => {
    setSelectedEmployee({
      employee_code: record.employee_code,
      full_name_eng: record.full_name_eng,
      division_name: record.division_name,
      department_name: record.department_name,
      pos_level: record.pos_level
    });
    
    // Check if there is an existing privilege for this user to pre-fill
    // We can use the data from the table record we just clicked
    setPrivilegeInput(record.privilege || ''); // <--- NEW

    setInputPlates(['']); 
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!selectedEmployee) {
      alert("Please select an employee.");
      return;
    }

    const validPlates = inputPlates.filter(p => p.trim().length > 0);

    // Allow saving if either plates exist OR privilege is being updated
    if (validPlates.length === 0 && privilegeInput.trim() === '') {
      alert("Please enter a license plate or a privilege note.");
      return;
    }

    try {
      // 1. Save Privilege (Upsert: Insert or Update) <--- NEW
      if (privilegeInput !== undefined) {
          const { error: privError } = await supabase
            .from('employee_privileges')
            .upsert({ 
                employee_code: selectedEmployee.employee_code, 
                privilege: privilegeInput,
                updated_at: new Date()
            });
          if (privError) throw privError;
      }

      // 2. Save Vehicles (if any)
      if (validPlates.length > 0) {
          const payload = validPlates.map(plate => ({
            employee_code: selectedEmployee.employee_code,
            license_plate: plate,
            is_active: true
          }));

          const { error: vehicleError } = await supabase
            .from('employee_vehicles')
            .insert(payload);

          if (vehicleError) throw vehicleError;
      }

      setModalOpen(false);
      fetchData(); // Refresh table
    } catch (error) {
      alert("Error saving: " + error.message);
    }
  };

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

  // --- 5. FILTERING ---
  const filteredRecords = records.filter(r => {
    const term = mainFilter.toLowerCase();
    const platesString = r.vehicles.map(v => v.license_plate).join(' ').toLowerCase();
    
    return (
      r.full_name_eng?.toLowerCase().includes(term) ||
      r.employee_code?.toLowerCase().includes(term) ||
      r.division_name?.toLowerCase().includes(term) ||
      r.privilege?.toLowerCase().includes(term) || // <--- NEW: Search by privilege
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
          <Plus size={18} /> Add Record
        </button>
      </div>

      {/* FILTER BAR */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 text-gray-400" size={20} />
        <input 
          type="text" 
          placeholder="Filter by Name, Code, Division, Plate or Privilege..." 
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
          <div className="overflow-x-auto rounded-lg">
            <table className="w-full text-left border-collapse">
              <thead className="bg-[#002D72] text-white">
                <tr>
                  <th className="py-3 px-4 text-center rounded-tl-lg">Employee</th>
                  <th className="py-3 px-4 text-center">Org Info</th>
                  <th className="py-3 px-4 text-center">Privilege</th> {/* <--- NEW Column */}
                  <th className="py-3 px-4 text-center">License Plate(s)</th>
                  <th className="py-3 px-4 text-center rounded-tr-lg">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRecords.length === 0 && (
                  <tr>
                    <td colSpan="5" className="p-6 text-center text-gray-400">
                      No matching records found.
                    </td>
                  </tr>
                )}
                {filteredRecords.map((rec) => (
                  <tr key={rec.employee_code} className="hover:bg-gray-50 transition align-top">
                    {/* Employee */}
                    <td className="py-3 px-4">
                      <div className="font-bold text-[#002D72]">{rec.full_name_eng}</div>
                      <div className="text-xs font-mono text-gray-500 bg-gray-100 inline-block px-1 rounded">
                        {rec.employee_code}
                      </div>
                    </td>

                    {/* Org Info */}
                    <td className="py-3 px-4 text-sm text-gray-600">
                      <div className="flex items-center gap-1">
                        <Building2 size={14} /> {rec.division_name}
                      </div>
                      <div className="text-gray-400 pl-5 text-xs">{rec.department_name}</div>
                    </td>

                    {/* Privilege Column (NEW) */}
                    <td className="py-3 px-4 text-center">
                        {rec.privilege ? (
                            <span className="text-xs font-bold text-orange-600 bg-orange-50 border border-orange-100 px-2 py-1 rounded-lg">
                                {rec.privilege}
                            </span>
                        ) : (
                            <span className="text-gray-300 text-xs">-</span>
                        )}
                    </td>

                    {/* Plates */}
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-2 justify-start">
                        {rec.vehicles.map((v) => (
                           <div key={v.id} className="group relative bg-white border border-gray-200 text-gray-800 text-sm font-semibold px-3 py-1 rounded-full shadow-sm flex items-center gap-2 hover:border-[#FA4786] transition-colors cursor-default">
                              <Car size={16} className="text-[#FA4786]" />
                              {v.license_plate}
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

                    {/* Action */}
                    <td className="py-3 px-4 text-center">
                        <button onClick={() => handleOpenEdit(rec)} className="text-blue-600 hover:bg-blue-50 p-2 rounded-lg transition" title="Edit / Add Plate">
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

      {/* MODAL */}
      <Modal 
        isOpen={modalOpen} 
        onClose={() => setModalOpen(false)} 
        title="Manage Vehicle & Privilege"
        onSave={handleSave}
        saveLabel="Save Records"
      >
        <div className="space-y-6">
          
          {/* 1. EMPLOYEE SELECTION */}
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
            <label className="flex items-center gap-2 text-sm font-bold text-[#002D72] mb-2">
              <User size={16}/> Employee Selection
            </label>
            
            {selectedEmployee ? (
              <div className="bg-white p-3 rounded-lg border shadow-sm flex justify-between items-center">
                <div>
                  <div className="font-bold text-gray-800">{selectedEmployee.full_name_eng}</div>
                  <div className="text-xs text-gray-500 font-mono">{selectedEmployee.employee_code} | {selectedEmployee.division_name}</div>
                </div>
                {/* Only show Change button if this is a NEW entry */}
                {records.every(r => r.employee_code !== selectedEmployee.employee_code) && (
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
                           // Check if this user already has a privilege loaded in main table
                           const existing = records.find(r => r.employee_code === res.employee_code);
                           if(existing) setPrivilegeInput(existing.privilege || '');
                           else setPrivilegeInput('');
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

          {/* 2. PRIVILEGE INPUT (NEW SECTION) */}
          <div>
             <label className="flex items-center gap-2 text-sm font-bold text-[#002D72] mb-2">
               <Star size={16}/> Privilege / Note
             </label>
             <input 
               type="text"
               placeholder="e.g. VIP, Night Shift, Reserved Parking"
               className="w-full border rounded-xl p-3 text-gray-700 focus:ring-2 focus:ring-[#FA4786] outline-none"
               value={privilegeInput}
               onChange={(e) => setPrivilegeInput(e.target.value)}
             />
          </div>

          {/* 3. LICENSE PLATE INPUTS */}
          <div>
            <label className="flex items-center justify-between text-sm font-bold text-[#002D72] mb-2">
              <span className="flex items-center gap-2"><Car size={16}/> License Plate(s)</span>
              <span className="text-xs font-normal text-gray-400">Max 5 per submission</span>
            </label>
            
            <div className="space-y-3">
                {inputPlates.map((plate, index) => (
                    <div key={index} className="flex gap-2">
                        <input 
                          type="text"
                          placeholder="e.g. 1กก1234"
                          className="flex-1 border-2 border-gray-200 rounded-xl p-3 text-lg font-bold text-gray-700 focus:border-[#FA4786] outline-none uppercase tracking-widest"
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
          </div>

        </div>
      </Modal>
    </div>
  );
}