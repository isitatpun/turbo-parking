import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Card } from '../components/UI';
import { Download, PieChart, Activity, Users } from 'lucide-react';
import Papa from 'papaparse';

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(1); 

  // Date Selection
  const currentDate = new Date();
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear()); 
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1);

  // Processed Data State
  const [reportData, setReportData] = useState({
    movement: [], 
    financials: { revenue: 0, net: 0, utilization: 0, totalReservedSpots: 0, occupiedReserved: 0 }, 
    inventory: [], 
    totalSpots: 0, 
    tenants: [] 
  });

  const years = [2025, 2026, 2027];
  const months = [
    { val: 1, label: 'January' }, { val: 2, label: 'February' }, { val: 3, label: 'March' },
    { val: 4, label: 'April' },   { val: 5, label: 'May' },      { val: 6, label: 'June' },
    { val: 7, label: 'July' },    { val: 8, label: 'August' },   { val: 9, label: 'September' },
    { val: 10, label: 'October' },{ val: 11, label: 'November' },{ val: 12, label: 'December' }
  ];

  // --- CUSTOM SORT ORDER ---
  const ZONE_ORDER = [
    'แถวแรกในลานจอด',
    'แถวสองในลานจอด',
    'แถวสามในลานจอด',
    'แถวสี่ในลานจอด',
    'แถวห้าในลานจอด',
    'แถวหกในลานจอด',
    'จอดซ้อนแถวสองในลาน',
    'จอดซ้อนแถวสี่ในลาน',
    'ริมถนน',
    'ศรีสมานฝั่ง MM',
    'ศรีสมานฝั่งใหม่'
  ];

  useEffect(() => {
    generateReport(selectedYear, selectedMonth);
  }, [selectedYear, selectedMonth]);

  async function generateReport(year, month) {
    try {
      setLoading(true);

      const daysInMonth = new Date(year, month, 0).getDate();
      const monthStart = new Date(year, month - 1, 1, 0, 0, 0); 
      const monthEnd = new Date(year, month - 1, daysInMonth, 23, 59, 59); 

      // Fetch Data
      const { data: spots } = await supabase.from('parking_spots').select('*').eq('is_active', true);
      
      const { data: bookings } = await supabase.from('bookings')
        .select(`*, employees (employee_code, full_name, employee_type, privilege), parking_spots (price, lot_id, spot_type, zone_text)`)
        .lte('booking_start', monthEnd.toISOString())
        .gte('booking_end', monthStart.toISOString());

      // Variables
      let beginCount = 0, beginAmt = 0;
      let newCount = 0, newAmt = 0;
      let expCount = 0, expAmt = 0;
      let endCount = 0, endAmt = 0;
      let totalRevenue = 0;
      let totalNetRevenue = 0;
      let reservedOccupiedCount = 0;
      const tenantReportList = [];

      // Process Bookings
      bookings?.forEach(b => {
        const bStart = new Date(b.booking_start);
        const bEnd = new Date(b.booking_end);
        const price = b.parking_spots?.price || 0;

        const effectiveStart = bStart < monthStart ? monthStart : bStart;
        const effectiveEnd = bEnd > monthEnd ? monthEnd : bEnd;
        const daysActive = Math.floor((effectiveEnd - effectiveStart) / (1000 * 60 * 60 * 24)) + 1;
        const proratedAmount = (price / daysInMonth) * daysActive;

        const isFree = b.employees?.employee_type === 'Management' || b.employees?.privilege === 'Bond Holder';
        const netFee = isFree ? 0 : proratedAmount;

        totalRevenue += proratedAmount;
        totalNetRevenue += netFee;

        if (bStart < monthStart) { beginCount++; beginAmt += proratedAmount; }
        if (bStart >= monthStart && bStart <= monthEnd) { newCount++; newAmt += proratedAmount; }
        if (bEnd >= monthStart && bEnd <= monthEnd) { expCount++; expAmt += proratedAmount; }
        
        if (bEnd >= monthEnd) {
            endCount++;
            endAmt += proratedAmount;
            if (b.parking_spots?.spot_type === 'Reserved (Paid) Parking') {
                reservedOccupiedCount++;
            }
        }

        tenantReportList.push({
            lot_id: b.parking_spots?.lot_id,
            employee_code: b.employees?.employee_code,
            full_name: b.employees?.full_name,
            start_date: effectiveStart.toLocaleDateString('en-GB'),
            end_date: effectiveEnd.toLocaleDateString('en-GB'),
            days: daysActive,
            total_amount: price,
            prorated_fee: proratedAmount.toFixed(2), 
            type: b.employees?.employee_type,
            privilege: b.employees?.privilege,
            net_fee: netFee.toFixed(2)
        });
      });

      // --- INVENTORY SUMMARY LOGIC ---
      const inventoryMap = {};
      let totalReservedSpots = 0;
      let grandTotalSpots = 0; 

      spots?.forEach(s => {
        const key = `${s.zone_text} - ${s.spot_type}`;
        if (!inventoryMap[key]) inventoryMap[key] = { zone: s.zone_text, type: s.spot_type, count: 0 };
        inventoryMap[key].count++;
        grandTotalSpots++;

        if (s.spot_type === 'Reserved (Paid) Parking') {
            totalReservedSpots++;
        }
      });

      // SORTING LOGIC
      const inventoryList = Object.values(inventoryMap).sort((a, b) => {
        const indexA = ZONE_ORDER.indexOf(a.zone);
        const indexB = ZONE_ORDER.indexOf(b.zone);

        if (indexA !== -1 && indexB !== -1) {
            if (indexA !== indexB) return indexA - indexB;
            return a.type.localeCompare(b.type);
        }
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        if (a.zone !== b.zone) return a.zone.localeCompare(b.zone);
        return a.type.localeCompare(b.type);
      });

      const utilization = totalReservedSpots > 0 
        ? (reservedOccupiedCount / totalReservedSpots) * 100 
        : 0;

      setReportData({
        movement: [
            { label: 'Beginning Balance', count: beginCount, amount: beginAmt },
            { label: 'New Booking', count: newCount, amount: newAmt },
            { label: 'Expired Booking', count: expCount, amount: expAmt },
            { label: 'Ending Balance', count: endCount, amount: endAmt },
        ],
        financials: {
            revenue: totalRevenue,
            net: totalNetRevenue,
            utilization: utilization,
            totalReservedSpots,
            occupiedReserved: reservedOccupiedCount
        },
        inventory: inventoryList,
        totalSpots: grandTotalSpots, 
        tenants: tenantReportList
      });

    } catch (error) {
      console.error("Error generating report:", error);
    } finally {
      setLoading(false);
    }
  }

  const handleExport = () => {
    const csv = Papa.unparse(reportData.tenants);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `Tenant_Report_${selectedYear}_${selectedMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getMonthName = (m) => months.find(x => x.val === parseInt(m))?.label || m;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* HEADER */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-[#002D72]">Reporting Center</h2>
        <div className="flex gap-3">
            <select 
              className="bg-white border border-gray-200 rounded-xl px-4 py-2 text-gray-700 shadow-sm outline-none focus:ring-2 focus:ring-[#FA4786] cursor-pointer"
              value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            >
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <select 
              className="bg-white border border-gray-200 rounded-xl px-4 py-2 text-gray-700 shadow-sm outline-none focus:ring-2 focus:ring-[#FA4786] cursor-pointer"
              value={selectedMonth} onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
            >
              {months.map((m) => <option key={m.val} value={m.val}>{m.label}</option>)}
            </select>
        </div>
      </div>

      {/* BANNER */}
      <div className="w-full bg-gradient-to-r from-[#FA4786] to-[#002D72] rounded-xl p-6 text-white flex justify-between items-center shadow-lg">
        <div>
          <p className="opacity-80 text-sm mb-1">System Status</p>
          <h3 className="text-3xl font-bold">Online</h3>
        </div>
        <div className="text-right opacity-80 text-sm">
           Data Snapshot: {selectedYear} {getMonthName(selectedMonth)} (Month End)
        </div>
      </div>

      {/* TABS */}
      <div className="grid grid-cols-3 bg-white p-1 rounded-xl border border-gray-200 shadow-sm">
        {[
            { id: 1, label: 'Booking Transactions', icon: Activity },
            { id: 2, label: 'Parking Summary', icon: PieChart }, // <--- UPDATED LABEL
            { id: 3, label: 'Monthly Tenant Report', icon: Users },
        ].map(tab => (
            <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center justify-center gap-2 py-3 rounded-lg font-medium transition-all duration-200 ${
                    activeTab === tab.id 
                    ? 'bg-[#002D72] text-white shadow-md' 
                    : 'text-gray-500 hover:bg-gray-50'
                }`}
            >
                <tab.icon size={18} />
                {tab.label}
            </button>
        ))}
      </div>

      {/* CONTENT */}
      <div className="min-h-[400px]">
        {loading ? <div className="p-12 text-center text-gray-400">Processing Reports...</div> : (
            <>
                {/* 1. TRANSACTIONS */}
                {activeTab === 1 && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                        <Card className="p-6">
                            <h3 className="text-lg font-bold text-[#002D72] mb-4">1.1 Monthly Booking Movement</h3>
                            <table className="w-full text-left">
                                <thead className="bg-gray-50 text-gray-600 border-b">
                                    <tr>
                                        <th className="py-3 px-4">Description</th>
                                        <th className="py-3 px-4 text-center">Count (Unit)</th>
                                        <th className="py-3 px-4 text-right">Amount (THB)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {reportData.movement.map((row, i) => (
                                        <tr key={i} className="border-b hover:bg-gray-50">
                                            <td className="py-3 px-4 font-medium text-gray-700">{row.label}</td>
                                            <td className="py-3 px-4 text-center font-bold">{row.count}</td>
                                            <td className="py-3 px-4 text-right font-mono">{row.amount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </Card>

                        <div className="grid grid-cols-3 gap-6">
                            <Card className="p-6 border-l-4 border-l-blue-500">
                                <p className="text-gray-500 text-sm">Total Revenue</p>
                                <h3 className="text-2xl font-bold text-[#002D72] mt-1">
                                    ฿ {reportData.financials.revenue.toLocaleString(undefined, {maximumFractionDigits: 0})}
                                </h3>
                            </Card>
                            <Card className="p-6 border-l-4 border-l-green-500">
                                <p className="text-gray-500 text-sm">Net Parking Fee</p>
                                <h3 className="text-2xl font-bold text-green-700 mt-1">
                                    ฿ {reportData.financials.net.toLocaleString(undefined, {maximumFractionDigits: 0})}
                                </h3>
                            </Card>
                            <Card className="p-6 border-l-4 border-l-[#FA4786]">
                                <p className="text-gray-500 text-sm">Occupancy Rate (% Usage)</p>
                                <div className="flex items-baseline gap-2 mt-1">
                                    <h3 className="text-2xl font-bold text-[#FA4786]">
                                        {reportData.financials.utilization.toFixed(1)}%
                                    </h3>
                                    <span className="text-xs text-gray-400">
                                        ({reportData.financials.occupiedReserved}/{reportData.financials.totalReservedSpots})
                                    </span>
                                </div>
                            </Card>
                        </div>
                    </div>
                )}

                {/* 2. INVENTORY (PARKING SUMMARY) */}
                {activeTab === 2 && (
                    <Card className="p-6 animate-in fade-in slide-in-from-bottom-4">
                        {/* UPDATED HEADER */}
                        <h3 className="text-lg font-bold text-[#002D72] mb-4">2. Parking Summary</h3>
                        <table className="w-full text-left">
                            <thead className="bg-[#002D72] text-white">
                                <tr>
                                    <th className="py-3 px-4 rounded-tl-lg">Zone</th>
                                    <th className="py-3 px-4">Type</th>
                                    <th className="py-3 px-4 text-center rounded-tr-lg">Total Spots</th>
                                </tr>
                            </thead>
                            <tbody>
                                {reportData.inventory.length === 0 && <tr><td colSpan="3" className="p-4 text-center">No spots found.</td></tr>}
                                {reportData.inventory.map((row, i) => (
                                    <tr key={i} className="border-b hover:bg-gray-50">
                                        <td className="py-3 px-4 font-bold text-gray-700">{row.zone}</td>
                                        <td className="py-3 px-4">
                                            <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs border">{row.type}</span>
                                        </td>
                                        <td className="py-3 px-4 text-center font-bold text-[#002D72]">{row.count}</td>
                                    </tr>
                                ))}
                            </tbody>
                            {/* UPDATED FOOTER ALIGNMENT */}
                            <tfoot className="bg-gray-100 font-bold border-t-2 border-gray-200">
                                <tr>
                                    <td colSpan="2" className="py-3 px-4 text-left text-[#002D72] uppercase tracking-wider">GRAND TOTAL</td>
                                    <td className="py-3 px-4 text-center text-[#FA4786] text-lg">{reportData.totalSpots}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </Card>
                )}

                {/* 3. TENANT REPORT */}
                {activeTab === 3 && (
                    <Card className="flex flex-col h-full animate-in fade-in slide-in-from-bottom-4">
                        <div className="p-6 border-b flex justify-between items-center bg-gray-50">
                            <h3 className="text-lg font-bold text-[#002D72]">3. Monthly Tenant Detail Report</h3>
                            <button 
                                onClick={handleExport}
                                className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition shadow-sm"
                            >
                                <Download size={18} /> Export Excel/CSV
                            </button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm whitespace-nowrap">
                                <thead className="bg-white text-gray-500 border-b-2">
                                    <tr>
                                        <th className="py-3 px-4">Lot ID</th>
                                        <th className="py-3 px-4">Emp Code</th>
                                        <th className="py-3 px-4">Name</th>
                                        <th className="py-3 px-4">Start (Month)</th>
                                        <th className="py-3 px-4">End (Month)</th>
                                        <th className="py-3 px-4 text-center">Days</th>
                                        <th className="py-3 px-4 text-right">Total Amount</th>
                                        <th className="py-3 px-4 text-right">Prorated Fee</th>
                                        <th className="py-3 px-4">Type</th>
                                        <th className="py-3 px-4">Privilege</th>
                                        <th className="py-3 px-4 text-right font-bold bg-gray-50">Net Fee</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {reportData.tenants.length === 0 && <tr><td colSpan="11" className="p-8 text-center text-gray-400">No bookings for this period.</td></tr>}
                                    {reportData.tenants.map((row, i) => (
                                        <tr key={i} className="border-b hover:bg-gray-50">
                                            <td className="py-3 px-4 font-bold text-[#002D72]">{row.lot_id}</td>
                                            <td className="py-3 px-4 font-mono">{row.employee_code}</td>
                                            <td className="py-3 px-4">{row.full_name}</td>
                                            <td className="py-3 px-4 text-gray-500">{row.start_date}</td>
                                            <td className="py-3 px-4 text-gray-500">{row.end_date}</td>
                                            <td className="py-3 px-4 text-center">{row.days}</td>
                                            <td className="py-3 px-4 text-right text-gray-400">{row.total_amount}</td>
                                            <td className="py-3 px-4 text-right">{row.prorated_fee}</td>
                                            <td className="py-3 px-4">{row.type}</td>
                                            <td className="py-3 px-4 text-[#FA4786]">{row.privilege || '-'}</td>
                                            <td className="py-3 px-4 text-right font-bold text-[#002D72] bg-gray-50/50">
                                                {row.net_fee}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                )}
            </>
        )}
      </div>
    </div>
  );
}