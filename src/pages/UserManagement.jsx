import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext'; // <--- Import Auth to check WHO is looking
import { Card } from '../components/UI';
import { Shield, CheckCircle, XCircle, Lock } from 'lucide-react';

export default function UserManagement() {
  const { role: myRole, user: myUser } = useAuth(); // Get Current User Info
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
        .order('role', { ascending: true }) // Show Admins/Masters first
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
      <div className="flex items-center gap-3">
        <div className={`p-3 rounded-xl text-white ${amIMaster ? 'bg-[#FA4786]' : 'bg-[#002D72]'}`}>
            <Shield size={24} />
        </div>
        <div>
            <h2 className="text-2xl font-bold text-[#002D72]">User Management</h2>
            <p className="text-sm text-gray-500">
                You are logged in as: <span className="font-bold uppercase">{myRole}</span>
            </p>
        </div>
      </div>

      <Card>
        {loading ? <div className="p-12 text-center text-gray-400">Loading Users...</div> : (
            <table className="w-full text-left">
                <thead className="bg-gray-50 border-b text-gray-600">
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

                        // 1. Can I edit this person?
                        // - If I am Master: Yes (unless it's myself to prevent locking out)
                        // - If I am Admin: No, if target is Master. Yes, if target is Admin/User.
                        let canEdit = true;
                        if (isTargetMaster && !amIMaster) canEdit = false; // Admin cannot touch Master
                        if (isMe) canEdit = false; // Cannot edit own role here (safety)

                        return (
                            <tr key={u.id} className={`border-b hover:bg-gray-50 ${isTargetMaster ? 'bg-purple-50/50' : ''}`}>
                                <td className="py-3 px-4">
                                    <div className="flex flex-col">
                                        <span className={`font-medium ${isTargetMaster ? 'text-[#FA4786]' : 'text-[#002D72]'}`}>
                                            {u.email || 'Unknown Email'}
                                        </span>
                                        {isMe && <span className="text-[10px] text-gray-400 uppercase">(You)</span>}
                                    </div>
                                </td>
                                
                                <td className="py-3 px-4">
                                    {canEdit ? (
                                        <select 
                                            className={`border rounded-lg px-2 py-1 text-sm outline-none font-bold cursor-pointer
                                                ${u.role === 'master_admin' ? 'text-purple-600 border-purple-200 bg-purple-50' : 
                                                  u.role === 'admin' ? 'text-[#FA4786] border-pink-200 bg-pink-50' : 'text-gray-600'}`}
                                            value={u.role}
                                            onChange={(e) => handleRoleChange(u.id, e.target.value)}
                                        >
                                            <option value="user">General User</option>
                                            <option value="admin">Admin</option>
                                            
                                            {/* Only Master Admin can create other Master Admins */}
                                            {amIMaster && <option value="master_admin">Master Admin</option>}
                                        </select>
                                    ) : (
                                        <div className="flex items-center gap-1 text-gray-400 text-sm font-bold bg-gray-100 px-2 py-1 rounded w-fit">
                                            <Lock size={12}/> {u.role === 'master_admin' ? 'MASTER ADMIN' : u.role.toUpperCase()}
                                        </div>
                                    )}
                                </td>

                                <td className="py-3 px-4">
                                    {u.is_verified ? (
                                        <span className="flex items-center gap-1 text-green-600 bg-green-50 px-2 py-1 rounded w-fit text-xs font-bold border border-green-200">
                                            <CheckCircle size={14}/> Verified
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-1 text-orange-600 bg-orange-50 px-2 py-1 rounded w-fit text-xs font-bold border border-orange-200">
                                            <XCircle size={14}/> Pending
                                        </span>
                                    )}
                                </td>

                                <td className="py-3 px-4 text-right flex justify-end gap-2">
                                    {canEdit && !u.is_verified && (
                                        <button 
                                            onClick={() => handleVerify(u.id, true)}
                                            className="bg-green-600 text-white px-3 py-1 rounded-lg text-sm hover:bg-green-700 transition shadow-sm"
                                        >
                                            Approve
                                        </button>
                                    )}
                                    {canEdit && u.is_verified && (
                                        <button 
                                            onClick={() => handleVerify(u.id, false)}
                                            className="text-gray-400 hover:text-red-500 text-sm underline"
                                        >
                                            Suspend
                                        </button>
                                    )}
                                    {!canEdit && <span className="text-gray-300 text-xs italic">Protected</span>}
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