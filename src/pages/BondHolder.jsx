import React, { useState, useEffect, useRef } from 'react';
import { UploadCloud, FileSpreadsheet, Download, AlertTriangle, FileText } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged,
  signInWithCustomToken
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  getDocs, 
  writeBatch, 
  doc,
  query,
  orderBy 
} from 'firebase/firestore';

// --- FIREBASE CONFIGURATION & INITIALIZATION ---
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// --- UI COMPONENTS (Inlined) ---
const Card = ({ children, className = "" }) => (
  <div className={`bg-white rounded-xl shadow-sm border border-blue-100 ${className}`}>
    {children}
  </div>
);

const Badge = ({ children, color = 'blue' }) => {
  const styles = {
    blue: "bg-blue-100 text-blue-800",
    pink: "bg-pink-100 text-pink-800",
    gray: "bg-gray-100 text-gray-800"
  };
  return (
    <span className={`px-2 py-1 rounded-md text-xs font-semibold ${styles[color] || styles.blue}`}>
      {children}
    </span>
  );
};

export default function BondHolderApp() {
  const [user, setUser] = useState(null);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [papaReady, setPapaReady] = useState(false);

  // --- 1. AUTHENTICATION & SCRIPT LOADING ---
  useEffect(() => {
    // Load PapaParse script dynamically
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js';
    script.async = true;
    script.onload = () => setPapaReady(true);
    document.body.appendChild(script);

    // Initialize Firebase Auth
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth error", err);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });

    return () => {
      unsubscribe();
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  // --- 2. FETCH DATA (Runs when user is authenticated) ---
  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    if (!user) return;
    try {
      setLoading(true);
      // Using a public collection so you can see data immediately for this demo.
      // In a real app with strict privacy, you'd use `users/${user.uid}/bond_holders`
      const collectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'bond_holders');
      
      // Note: simple query for robustness
      const q = query(collectionRef);
      const snapshot = await getDocs(q);
      
      const bonds = snapshot.docs.map(doc => doc.data());
      
      // Client-side sort by ID to ensure order (Firestore orderBy requires index sometimes)
      bonds.sort((a, b) => {
        // Try numerical sort if possible, otherwise string sort
        const numA = parseInt(a.id);
        const numB = parseInt(b.id);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return String(a.id).localeCompare(String(b.id));
      });

      setData(bonds);
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  // --- 3. HANDLE FILE UPLOAD (WIPE & REPLACE) ---
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!papaReady) {
      alert("CSV Parser is still loading, please try again in a moment.");
      return;
    }

    if (!user) {
        alert("Authentication not ready.");
        return;
    }

    if (!window.confirm("⚠️ WARNING: This will DELETE ALL current Bond Holder data and replace it with this file.\n\nAre you sure?")) {
        event.target.value = null; 
        return;
    }

    setUploading(true);

    window.Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      // FIX 1: Handle Excel "BOM" characters that often break the first column (id)
      transformHeader: (header) => header.trim().replace(/^\ufeff/, ''), 
      complete: async (results) => {
        try {
          const rawRows = results.data;
          
          // Validate Columns
          const requiredCols = ['id', 'full_name', 'employee_code', 'tier'];
          const fileCols = results.meta.fields || [];
          const missing = requiredCols.filter(col => !fileCols.includes(col));
          
          if (missing.length > 0) {
            throw new Error(`Missing columns: ${missing.join(', ')}. Please check your CSV file headers.`);
          }

          // Process Data
          const formattedRows = rawRows.map(row => {
            // FIX 2: Ensure ID is a string and trimmed (prevents whitespace errors)
            const cleanId = row.id ? String(row.id).trim() : null;
            
            if (!cleanId) {
                return null;
            }

            let cleanCode = row.employee_code ? String(row.employee_code).trim() : '';
            cleanCode = cleanCode.padStart(8, '0');

            return {
                id: cleanId,
                full_name: row.full_name,
                employee_code: cleanCode,
                tier: parseInt(row.tier) || 0,
                created_at: new Date().toISOString() 
            };
          }).filter(row => row !== null); 

          if (formattedRows.length === 0) {
            throw new Error("The file appears to be empty or has no valid IDs.");
          }

          // --- FIRESTORE BATCH DELETE & WRITE ---
          // 1. Get all current docs to delete
          const collectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'bond_holders');
          const currentSnapshot = await getDocs(collectionRef);
          
          // Firestore batch allows max 500 ops. We'll handle chunks if needed, 
          // but for this demo, we'll assume <500 for simplicity or just loop batches.
          // A robust app handles chunks of 500.
          
          const batchSize = 450; // safe margin
          let batch = writeBatch(db);
          let operationCount = 0;

          // Delete Ops
          for (const docSnapshot of currentSnapshot.docs) {
             batch.delete(docSnapshot.ref);
             operationCount++;
             if (operationCount >= batchSize) {
                await batch.commit();
                batch = writeBatch(db);
                operationCount = 0;
             }
          }

          // Insert Ops
          for (const row of formattedRows) {
            // Using a new doc ref for each
            const newDocRef = doc(collectionRef); 
            batch.set(newDocRef, row);
            operationCount++;
            if (operationCount >= batchSize) {
                await batch.commit();
                batch = writeBatch(db);
                operationCount = 0;
             }
          }

          // Commit remaining
          if (operationCount > 0) {
            await batch.commit();
          }

          alert(`Successfully replaced database with ${formattedRows.length} records!`);
          fetchData(); 

        } catch (error) {
          console.error("Upload Error Details:", error);
          alert("Upload Failed: " + error.message);
        } finally {
          setUploading(false);
          event.target.value = null; 
        }
      }
    });
  };

  // --- 3. DOWNLOAD CSV ---
  const handleDownload = () => {
    if (data.length === 0) return alert("No data to download.");
    if (!papaReady) return alert("Export tool loading...");
    
    // Convert to CSV with Specific Headers
    const csvData = data.map(item => ({
        "id": item.id,
        "full_name": item.full_name,
        "employee_code": item.employee_code,
        "tier": item.tier
    }));

    const csv = window.Papa.unparse(csvData);

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
    <div className="bg-gray-50 min-h-screen p-6 font-sans">
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-500">
       
       <div className="flex justify-between items-center">
         <h2 className="text-2xl font-bold text-[#002D72]">Bond Holder Management</h2>
         
         {/* EXPORT BUTTON (Only shows if data exists) */}
         {data.length > 0 && (
            <button 
                onClick={handleDownload}
                className="flex items-center gap-2 text-[#002D72] hover:bg-blue-50 px-4 py-2 rounded-xl transition border border-blue-100 font-medium bg-white shadow-sm"
            >
                <Download size={18}/> Export CSV
            </button>
         )}
       </div>

       {/* GUIDE */}
       <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-4 items-start shadow-sm">
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
                        <span key={h} className="bg-white px-2 py-1 rounded border text-gray-500 shadow-sm">{h}</span>
                    ))}
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs text-orange-600 bg-orange-50 px-3 py-2 rounded-lg border border-orange-100 w-fit">
                    <AlertTriangle size={14} />
                    <span><strong>Warning:</strong> Uploading a file will <u>REPLACE ALL</u> existing data in the system.</span>
                </div>
            </div>
       </div>
       
       <div className="flex flex-col gap-6">
         {/* Upload Area */}
         <div className="relative group">
            <input 
                type="file" 
                accept=".csv" 
                onChange={handleFileUpload}
                disabled={uploading || !papaReady}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
            <div className={`
                border-4 border-dashed rounded-3xl flex flex-col items-center justify-center p-8 transition duration-300
                ${uploading ? 'bg-gray-100 border-gray-300' : 'border-gray-200 bg-white group-hover:bg-blue-50 group-hover:border-[#FA4786]'}
            `}>
                <div className="bg-white p-4 rounded-full shadow-md mb-4 group-hover:scale-110 transition border border-gray-100">
                    <UploadCloud size={48} className={uploading ? "text-gray-400 animate-bounce" : "text-[#FA4786]"} />
                </div>
                <p className="text-lg font-bold text-gray-700">
                    {uploading ? "Uploading & Processing..." : "Click or Drag to Upload CSV"}
                </p>
                <p className="text-sm text-gray-400 mt-2">
                    {!papaReady ? "Initializing CSV parser..." : "Supports .csv files only"}
                </p>
            </div>
         </div>

         {/* TABLE */}
         <Card className="overflow-hidden flex flex-col bg-white">
            {loading ? (
                <div className="p-12 text-center text-gray-400 flex flex-col items-center gap-2">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <p>Loading data...</p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-50 border-b text-gray-600">
                            <tr>
                                <th className="py-3 px-4 text-sm font-semibold uppercase tracking-wider">ID</th>
                                <th className="py-3 px-4 text-sm font-semibold uppercase tracking-wider">Full Name</th>
                                <th className="py-3 px-4 text-sm font-semibold uppercase tracking-wider">Employee Code</th> 
                                <th className="py-3 px-4 text-sm font-semibold uppercase tracking-wider">Tier</th>
                                <th className="py-3 px-4 text-sm font-semibold uppercase tracking-wider">Uploaded At</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
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
                            {data.map((row, idx) => (
                                <tr key={row.id + idx} className="hover:bg-gray-50 transition-colors">
                                    <td className="py-3 px-4 font-bold text-[#002D72]">{row.id}</td>
                                    <td className="py-3 px-4 text-gray-800">{row.full_name}</td>
                                    <td className="py-3 px-4">
                                        <span className="font-mono bg-blue-50 text-blue-700 rounded px-2 py-0.5 text-sm border border-blue-100">
                                            {row.employee_code}
                                        </span>
                                    </td>
                                    <td className="py-3 px-4">
                                        <Badge color={row.tier === 0 ? 'pink' : 'blue'}>Tier {row.tier}</Badge>
                                    </td>
                                    <td className="py-3 px-4 text-gray-500 text-sm">
                                        {row.created_at ? new Date(row.created_at).toLocaleString('th-TH') : '-'}
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
    </div>
  );
}