import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext'; 
import { Card } from '../components/UI';
import { CheckCircle, XCircle, Lock } from 'lucide-react';

export default function UserManagement() {
  const { role: myRole, user: myUser } = useAuth(); 
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Is the current user a Master Admin?
  const amIMaster = myRole === 'master_admin';

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('user_roles')
        .select('*')
        .order('role', { ascending: true }) 
        .order('email', { ascending: true });

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      alert("Error fetching users: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (id, newRole) => {
    try {
      const { error } = await supabase.from('user_roles').update({ role: newRole }).eq('id', id);
      if (error) throw error;
      fetchUsers();
    } catch (error) {
      alert("Error updating role: " + error.message);
    }
  };

  const handleVerify = async (id, status) => {
    try {
      const { error } = await supabase.from('user_roles').update({ is_verified: status }).eq('id', id);
      if (error) throw error;
      fetchUsers();
    } catch (error) {
      alert("Error updating status: " + error.message);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* HEADER - Updated to remove icon */}
      <div className="flex flex-col">
        <h2 className="text-2xl font-bold text-[#002D72]">User Management</h2>
        <p className="text-sm text-gray-500 mt-1">
            You are logged in as: <span className="font-bold uppercase text-[#FA4786]">{myRole.replace('_', ' ')}</span>
        </p>
      </div>

      <Card>
        {loading ? <div className="p-12 text-center text-gray-400">Loading Users...</div> : (
            <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 border-b text-gray-600 font-bold">
                    <tr>
                        <th className="py-3 px-4">Email</th>
                        <th className="py-3 px-4">Role</th>
                        <th className="py-3 px-4">Verification Status</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {users.map((u) => {
                        // --- SECURITY LOGIC ---
                        const isTargetMaster = u.role === 'master_admin';
                        const isMe = u.email === myUser?.email;

                        let canEdit = true;
                        if (isTargetMaster && !amIMaster) canEdit = false; 
                        if (isMe) canEdit = false; 

                        return (
                            <tr key={u.id} className={`border-b last:border-0 hover:bg-gray-50 transition ${isTargetMaster ? 'bg-purple-50/30' : ''}`}>
                                <td className="py-3 px-4">
                                    <div className="flex flex-col">
                                        <span className={`font-medium ${isTargetMaster ? 'text-[#FA4786]' : 'text-[#002D72]'}`}>
                                            {u.email || 'Unknown Email'}
                                        </span>
                                        {isMe && <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wide mt-0.5">(YOU)</span>}
                                    </div>
                                </td>
                                
                                <td className="py-3 px-4">
                                    {canEdit ? (
                                        <select 
                                            className={`border rounded-lg px-3 py-1.5 text-sm outline-none font-bold cursor-pointer transition focus:ring-2 focus:ring-[#FA4786]/20
                                                ${u.role === 'master_admin' ? 'text-purple-600 border-purple-200 bg-purple-50' : 
                                                  u.role === 'admin' ? 'text-[#FA4786] border-pink-200 bg-pink-50' : 'text-gray-600 border-gray-200 bg-white'}`}
                                            value={u.role}
                                            onChange={(e) => handleRoleChange(u.id, e.target.value)}
                                        >
                                            <option value="user">General User</option>
                                            <option value="admin">Admin</option>
                                            
                                            {/* Only Master Admin can create other Master Admins */}
                                            {amIMaster && <option value="master_admin">Master Admin</option>}
                                        </select>
                                    ) : (
                                        <div className="flex items-center gap-1.5 text-gray-400 text-xs font-bold bg-gray-100 px-3 py-1.5 rounded-lg w-fit border border-gray-200 uppercase tracking-wide">
                                            <Lock size={12}/> {u.role.replace('_', ' ')}
                                        </div>
                                    )}
                                </td>

                                <td className="py-3 px-4">
                                    {u.is_verified ? (
                                        <span className="inline-flex items-center gap-1.5 text-green-700 bg-green-50 px-3 py-1 rounded-full text-xs font-bold border border-green-200">
                                            <CheckCircle size={14}/> Verified
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1.5 text-orange-700 bg-orange-50 px-3 py-1 rounded-full text-xs font-bold border border-orange-200">
                                            <XCircle size={14}/> Pending
                                        </span>
                                    )}
                                </td>

                                <td className="py-3 px-4 text-right flex justify-end gap-3 items-center h-full">
                                    {canEdit && !u.is_verified && (
                                        <button 
                                            onClick={() => handleVerify(u.id, true)}
                                            className="text-green-600 hover:text-green-800 hover:underline text-sm font-medium transition"
                                        >
                                            Approve
                                        </button>
                                    )}
                                    {canEdit && u.is_verified && (
                                        <button 
                                            onClick={() => handleVerify(u.id, false)}
                                            className="text-gray-400 hover:text-red-600 hover:underline text-sm transition"
                                        >
                                            Suspend
                                        </button>
                                    )}
                                    {!canEdit && <span className="text-gray-300 text-xs italic pr-2">Protected</span>}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        )}
      </Card>
    </div>
  );
}