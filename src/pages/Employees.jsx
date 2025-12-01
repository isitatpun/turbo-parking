import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Card, Modal, Badge } from '../components/UI';
import { Plus, Edit2, Trash2, Car, AlertCircle } from 'lucide-react';

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const [editingId, setEditingId] = useState(null);

  // Dynamic License Plates State
  const [plateCount, setPlateCount] = useState(1);
  const [plateInputs, setPlateInputs] = useState(['']);

  // Validation State
  const [codeError, setCodeError] = useState('');

  const [formData, setFormData] = useState({
    full_name: '', 
    employee_code: '', 
    employee_type: 'General', 
    // privilege: '' // Removed from state, now calculated
  });

  useEffect(() => {
    fetchEmployees();
  }, []);

  const fetchEmployees = async () => {
    try {
      setLoading(true);

      // 1. Fetch Active Employees
      const { data: empData, error: empError } = await supabase
        .from('employees')
        .select('*')
        .eq('is_active', true)
        .order('id', { ascending: true }); // <--- ORDER BY ID ASC

      if (empError) throw empError;

      // 2. Fetch Bond Holders to lookup Privilege
      const { data: bondData, error: bondError } = await supabase
        .from('bond_holders')
        .select('employee_code, tier');

      if (bondError) throw bondError;

      // 3. Merge Data to Calculate Privilege
      const mergedData = (empData || []).map(emp => {
        // Find matching bond holder
        const bondHolder = bondData.find(b => b.employee_code === emp.employee_code);
        
        // Logic: Found ? Tier X : "-"
        const calculatedPrivilege = bondHolder 
            ? `Bond Holder Tier ${bondHolder.tier}` 
            : '-';

        return {
            ...emp,
            display_privilege: calculatedPrivilege 
        };
      });

      setEmployees(mergedData);

    } catch (error) {
      console.error(error);
      alert("Error loading data: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  // --- HANDLE LICENSE PLATES ---
  const handlePlateCountChange = (count) => {
    const newCount = parseInt(count) || 1;
    setPlateCount(newCount);
    const newInputs = [...plateInputs];
    while (newInputs.length < newCount) newInputs.push('');
    while (newInputs.length > newCount) newInputs.pop();
    setPlateInputs(newInputs);
  };

  const handlePlateInputChange = (index, value) => {
    const newInputs = [...plateInputs];
    newInputs[index] = value;
    setPlateInputs(newInputs);
  };

  // --- VALIDATION LOGIC ---
  const handleCodeChange = (e) => {
    const val = e.target.value;
    if (!/^\d*$/.test(val)) return; // Only numbers
    if (val.length > 8) return; // Max 8

    setFormData({ ...formData, employee_code: val });

    if (val.length > 0 && val.length !== 8) {
        setCodeError("Code must be exactly 8 digits (e.g. 00005329)");
    } else {
        setCodeError("");
    }
  };

  // --- OPEN MODALS ---
  const handleAddClick = () => {
    setEditingId(null);
    setFormData({ full_name: '', employee_code: '', employee_type: 'General' });
    setPlateCount(1);
    setPlateInputs(['']);
    setCodeError('');
    setModalOpen(true);
  };

  const handleEditClick = (emp) => {
    setEditingId(emp.id);
    setFormData({
        full_name: emp.full_name,
        employee_code: emp.employee_code,
        employee_type: emp.employee_type,
    });
    setCodeError('');

    const plates = emp.license_plate ? emp.license_plate.split(', ') : [''];
    setPlateCount(plates.length);
    setPlateInputs(plates);
    setModalOpen(true);
  };

  // --- SAVE DATA (INSERT OR UPDATE) ---
  const handleSave = async () => {
    // 1. Basic Format Validation
    if (formData.employee_code.length !== 8) {
        setCodeError("⚠ Cannot save: Employee Code must be 8 digits.");
        return;
    }

    try {
      // 2. DUPLICATE CHECK (Only for new entries)
      if (!editingId) {
          const { data: existing, error: checkError } = await supabase
            .from('employees')
            .select('id')
            .eq('employee_code', formData.employee_code);

          if (checkError) throw checkError;

          if (existing && existing.length > 0) {
              alert(`Error: Employee Code "${formData.employee_code}" already exists in the system.`);
              return; // Stop execution
          }
      }

      // 3. Prepare Data
      const combinedPlates = plateInputs.filter(p => p.trim() !== '').join(', ');

      const empData = {
        full_name: formData.full_name,
        employee_code: formData.employee_code,
        employee_type: formData.employee_type,
        // privilege:  We do not save privilege anymore, it is looked up dynamically
        license_plate: combinedPlates,
        is_active: true
      };

      if (editingId) {
        // UPDATE
        const { error } = await supabase.from('employees').update(empData).eq('id', editingId);
        if (error) throw error;
        alert("Employee Updated!");
      } else {
        // CREATE
        const generatedID = `EMP-${formData.employee_code}`;
        const { error } = await supabase.from('employees').insert([{ 
            ...empData, 
            id: generatedID,
            start_date: new Date()
        }]);
        if (error) throw error;
        alert("Employee Added!");
      }

      setModalOpen(false);
      fetchEmployees();
    } catch (error) {
      alert("Error: " + error.message);
    }
  };

  // --- SOFT DELETE FUNCTION ---
  const handleDelete = async (id) => {
    if(!window.confirm("Are you sure you want to delete this employee?")) return;
    try {
        const { error } = await supabase
            .from('employees')
            .update({ 
                is_active: false, 
                end_date: new Date() 
            })
            .eq('id', id);

        if (error) throw error;
        
        alert("Employee deactivated successfully.");
        fetchEmployees(); 
    } catch (error) {
        alert("Error: " + error.message);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-[#002D72]">Employee Information</h2>
        <button onClick={handleAddClick} className="bg-[#FA4786] text-white px-4 py-2 rounded-xl flex items-center gap-2 hover:bg-pink-600 shadow-lg transition">
          <Plus size={18} /> Add Employee
        </button>
      </div>

      <Card>
        {loading ? <div className="p-8 text-center">Loading...</div> : (
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b text-gray-600">
              <tr>
                {['ID', 'Name', 'Code', 'Type', 'Privilege', 'License Plates', 'Action'].map(h => <th key={h} className="py-3 px-4 font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody>
               {employees.length === 0 && <tr><td colSpan="7" className="p-4 text-center text-gray-400">No active employees found.</td></tr>}
               {employees.map((emp) => (
                 <tr key={emp.id} className="border-b hover:bg-gray-50">
                   <td className="py-3 px-4 font-bold text-[#002D72]">{emp.id}</td>
                   <td className="py-3 px-4">{emp.full_name}</td>
                   <td className="py-3 px-4 font-mono text-gray-500">{emp.employee_code}</td>
                   <td className="py-3 px-4"><Badge color="blue">{emp.employee_type}</Badge></td>
                   
                   {/* CALCULATED PRIVILEGE DISPLAY */}
                   <td className="py-3 px-4 text-[#FA4786] font-medium">
                       {emp.display_privilege}
                   </td>

                   <td className="py-3 px-4">
                     <div className="flex flex-wrap gap-1">
                        {emp.license_plate?.split(',').map((p, i) => (
                            <span key={i} className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs border">{p}</span>
                        ))}
                     </div>
                   </td>
                   <td className="py-3 px-4 flex gap-2">
                     <button onClick={() => handleEditClick(emp)} className="text-blue-600 hover:bg-blue-50 p-2 rounded-lg"><Edit2 size={16}/></button>
                     <button onClick={() => handleDelete(emp.id)} className="text-red-500 hover:bg-red-50 p-2 rounded-lg"><Trash2 size={16}/></button>
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
        title={editingId ? "Edit Employee" : "Add Employee"} 
        onSave={handleSave} 
        saveLabel={editingId ? "Save Changes" : "Add Employee"} // English Only
      >
        <div className="space-y-4">
            {!editingId && (
                <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">Generated ID (Preview)</label>
                    <div className="w-full bg-gray-100 border rounded-lg p-2 text-gray-500 font-mono">
                        {formData.employee_code.length > 0 ? `EMP-${formData.employee_code}` : 'EMP-00000000'}
                    </div>
                </div>
            )}
            {editingId && (
                <div>
                      <label className="block text-sm font-medium text-gray-500 mb-1">Employee ID</label>
                      <input type="text" disabled value={editingId} className="w-full bg-gray-100 border rounded-lg p-2 text-gray-500" />
                </div>
            )}

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                    <input type="text" className="w-full border rounded-lg p-2" value={formData.full_name} onChange={e => setFormData({...formData, full_name: e.target.value})} />
                </div>
                
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Employee Code (8 digits) <span className="text-red-500">*</span>
                    </label>
                    <input 
                        type="text" 
                        className={`w-full border rounded-lg p-2 font-mono ${codeError ? 'border-red-500 bg-red-50 focus:ring-red-200' : ''}`}
                        value={formData.employee_code} 
                        onChange={handleCodeChange}
                        placeholder="00000000"
                    />
                    {codeError && (
                        <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
                            <AlertCircle size={12}/> {codeError}
                        </p>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                    <select className="w-full border rounded-lg p-2" value={formData.employee_type} onChange={e => setFormData({...formData, employee_type: e.target.value})}>
                        <option value="General">General</option>
                        <option value="Management">Management</option>
                    </select>
                </div>
                
                {/* PRIVILEGE INPUT REMOVED - Auto Calculated */}
                <div>
                     <label className="block text-sm font-medium text-gray-400 mb-1">Privilege</label>
                     <div className="w-full bg-gray-50 border border-gray-100 rounded-lg p-2 text-gray-400 text-sm italic">
                        Auto-lookup from Bond Holders
                     </div>
                </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                <div className="flex justify-between items-center mb-2">
                    <label className="text-sm font-bold text-[#002D72] flex items-center gap-2">
                        <Car size={16}/> License Plates
                    </label>
                    <div className="flex items-center gap-2 text-sm">
                        <span>Amount:</span>
                        <select 
                            className="border rounded p-1" 
                            value={plateCount} 
                            onChange={(e) => handlePlateCountChange(e.target.value)}
                        >
                            {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                    </div>
                </div>
                <div className="space-y-2">
                    {plateInputs.map((plate, index) => (
                        <input 
                            key={index}
                            type="text" 
                            placeholder={`License Plate #${index + 1}`} 
                            className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-[#FA4786] outline-none"
                            value={plate}
                            onChange={(e) => handlePlateInputChange(index, e.target.value)}
                        />
                    ))}
                </div>
            </div>
        </div>
      </Modal>
    </div>
  );
}