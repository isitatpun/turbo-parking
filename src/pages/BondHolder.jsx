import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import Papa from 'papaparse'; 
import { Card, Badge } from '../components/UI';
import { UploadCloud, FileSpreadsheet, Download, AlertTriangle, FileText } from 'lucide-react';

export default function BondHolder() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  // --- 1. FETCH DATA ---
  const fetchData = async () => {
    try {
      const { data: bonds, error } = await supabase
        .from('bond_holders')
        .select('*')
        .order('id', { ascending: true });
      
      if (error) throw error;
      setData(bonds || []);
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  // --- 2. HANDLE FILE UPLOAD (WIPE & REPLACE) ---
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!window.confirm("⚠️ WARNING: This will DELETE ALL current Bond Holder data and replace it with this file.\n\nAre you sure?")) {
        event.target.value = null; 
        return;
    }

    setUploading(true);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      // --- THE FIX: Clean invisible characters from Excel headers ---
      transformHeader: (header) => header.replace(/[\ufeff|\u00a0]/g, "").trim(),
      
      complete: async (results) => {
        try {
          const rawRows = results.data;
          
          // 2.1 Validate Columns
          const requiredCols = ['id', 'full_name', 'employee_code', 'tier'];
          const fileCols = results.meta.fields || [];
          
          const missing = requiredCols.filter(col => !fileCols.includes(col));
          
          if (missing.length > 0) {
            throw new Error(`Missing columns: ${missing.join(', ')}. Check your CSV headers.`);
          }

          if (rawRows.length === 0) {
            throw new Error("The file is empty.");
          }

          // 2.2 Clean and Format Data
          // Filter out rows where ID is empty/null to avoid database errors
          const validRows = rawRows.filter(row => row.id && String(row.id).trim() !== '');

          if (validRows.length === 0) {
            throw new Error("No valid rows found. Please check that the 'id' column is not empty.");
          }

          const formattedRows = validRows.map(row => {
            // Safe string conversion
            let cleanCode = row.employee_code ? String(row.employee_code).trim() : '';
            cleanCode = cleanCode.padStart(8, '0');

            return {
                id: String(row.id).trim(), 
                full_name: row.full_name?.trim(),
                employee_code: cleanCode,
                tier: parseInt(row.tier) || 0,
                created_at: new Date().toISOString()
            };
          });

          console.log("Attempting to upload:", formattedRows); // Debugging log

          // 2.3 STEP A: WIPE (Delete Old Data)
          // We use a filter that matches everything to ensure a full wipe.
          const { error: deleteError } = await supabase
            .from('bond_holders')
            .delete()
            .neq('id', '_______'); // Selects everything that isn't this random string
          
          if (deleteError) throw deleteError;

          // 2.4 STEP B: REPLACE (Insert New Data)
          const { error: insertError } = await supabase
            .from('bond_holders')
            .insert(formattedRows);

          if (insertError) throw insertError;

          alert(`Success! Database updated with ${formattedRows.length} records.`);
          fetchData(); 

        } catch (error) {
          console.error("Upload error details:", error);
          alert("Upload Failed: " + error.message);
        } finally {
          setUploading(false);
          event.target.value = null; // Reset input
        }
      }
    });
  };

  // --- 3. DOWNLOAD CSV ---
  const handleDownload = () => {
    if (data.length === 0) return alert("No data to download.");
    
    const csvData = data.map(item => ({
        "id": item.id,
        "full_name": item.full_name,
        "employee_code": item.employee_code,
        "tier": item.tier
    }));

    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `bond_holders_export_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 h-[calc(100vh-140px)] flex flex-col">
       <div className="flex justify-between items-center">
         <h2 className="text-2xl font-bold text-[#002D72]">Bond Holder Management</h2>
         
         {data.length > 0 && (
            <button 
                onClick={handleDownload}
                className="flex items-center gap-2 text-[#002D72] hover:bg-blue-50 px-4 py-2 rounded-xl transition border border-blue-100 font-medium"
            >
                <Download size={18}/> Export CSV
            </button>
         )}
       </div>

       {/* GUIDE */}
       <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-4 items-start">
            <div className="bg-white p-2 rounded-full text-blue-600 shadow-sm mt-1">
                <FileText size={20} />
            </div>
            <div>
                <h3 className="font-bold text-[#002D72]">File Format Guide</h3>
                <p className="text-sm text-gray-600 mt-1">
                    Your CSV file must contain exactly these 4 headers:
                </p>
                <div className="flex gap-2 mt-2 font-mono text-xs">
                    {['id', 'full_name', 'employee_code', 'tier'].map(h => (
                        <span key={h} className="bg-white px-2 py-1 rounded border text-gray-500">{h}</span>
                    ))}
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs text-orange-600 bg-orange-50 px-3 py-2 rounded-lg border border-orange-100 w-fit">
                    <AlertTriangle size={14} />
                    <span><strong>Warning:</strong> Uploading a file will <u>REPLACE ALL</u> existing data in the system.</span>
                </div>
            </div>
       </div>
       
       <div className="flex-1 flex flex-col gap-6">
         {/* Upload Area */}
         <div className="relative group">
            <input 
                type="file" 
                accept=".csv" 
                onChange={handleFileUpload}
                disabled={uploading}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
            <div className={`
                border-4 border-dashed rounded-3xl flex flex-col items-center justify-center p-8 transition duration-300
                ${uploading ? 'bg-gray-100 border-gray-300' : 'border-gray-200 bg-gray-50 group-hover:bg-white group-hover:border-[#FA4786]'}
            `}>
                <div className="bg-white p-4 rounded-full shadow-sm mb-4 group-hover:scale-110 transition">
                    <UploadCloud size={48} className={uploading ? "text-gray-400 animate-bounce" : "text-[#FA4786]"} />
                </div>
                <p className="text-lg font-bold text-gray-700">
                    {uploading ? "Uploading & Processing..." : "Click or Drag to Upload CSV"}
                </p>
                <p className="text-sm text-gray-400 mt-2">Supports .csv files only</p>
            </div>
         </div>

         {/* TABLE */}
         <Card className="flex-1 overflow-hidden flex flex-col">
            {loading ? <div className="p-12 text-center text-gray-400">Loading data...</div> : (
                <div className="overflow-auto flex-1">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 border-b text-gray-600 sticky top-0">
                            <tr>
                                <th className="py-3 px-4">ID</th>
                                <th className="py-3 px-4">Full Name</th>
                                <th className="py-3 px-4">Employee Code</th> 
                                <th className="py-3 px-4">Tier</th>
                                <th className="py-3 px-4">Uploaded At</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.length === 0 && (
                                <tr>
                                    <td colSpan="5" className="p-12 text-center text-gray-400">
                                        <div className="flex flex-col items-center justify-center">
                                            <FileSpreadsheet size={48} className="opacity-20 mb-2"/>
                                            <p>No Bond Holder Data (ยังไม่มีข้อมูล)</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                            {data.map((row) => (
                                <tr key={row.id} className="border-b hover:bg-gray-50">
                                    <td className="py-3 px-4 font-bold text-[#002D72]">{row.id}</td>
                                    <td className="py-3 px-4">{row.full_name}</td>
                                    <td className="py-3 px-4 font-mono bg-blue-50 text-blue-600 rounded px-2 w-fit">
                                        {row.employee_code}
                                    </td>
                                    <td className="py-3 px-4">
                                        <Badge color={row.tier === 0 ? 'pink' : 'blue'}>Tier {row.tier}</Badge>
                                    </td>
                                    <td className="py-3 px-4 text-gray-500 text-sm">
                                        {new Date(row.created_at).toLocaleString('th-TH')}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
         </Card>
       </div>
    </div>
  );
}