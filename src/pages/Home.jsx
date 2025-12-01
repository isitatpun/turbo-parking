import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Card } from '../components/UI';
import { 
  BarChart3, 
  Calendar, 
  FileSpreadsheet, 
  FileText,
  Activity
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable'; // Updated Import for compatibility

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(1);
  const [reportData, setReportData] = useState(null);
  
  // --- DATE FILTER STATE ---
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth(); // 0-11
  
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);

  // Safety Check
  useEffect(() => {
    if (selectedYear === currentYear && selectedMonth > currentMonth) {
        setSelectedMonth(currentMonth);
    }
  }, [selectedYear]);

  useEffect(() => {
    fetchReportData();
  }, [selectedYear, selectedMonth]);

  const fetchReportData = async () => {
    try {
      setLoading(true);

      const [bookingsRes, spotsRes, bondRes] = await Promise.all([
        supabase.from('bookings').select(`
            *, 
            employees (employee_code, full_name, license_plate), 
            parking_spots (lot_id, price, zone_text, spot_type)
        `),
        supabase.from('parking_spots').select('*'),
        supabase.from('bond_holders').select('employee_code, tier')
      ]);

      if (bookingsRes.error) throw bookingsRes.error;

      const processed = processMonthlyData(
        bookingsRes.data, 
        spotsRes.data, 
        bondRes.data, 
        selectedYear, 
        selectedMonth
      );
      
      setReportData(processed);

    } catch (error) {
      console.error("Error generating report:", error);
      alert("Error generating report. Check console.");
    } finally {
      setLoading(false);
    }
  };

  // --- CORE CALCULATION ENGINE ---
  const processMonthlyData = (bookings, allSpots, bondHolders, year, month) => {
    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0); // Last day of chosen month
    const daysInMonth = endDate.getDate(); // e.g. 30 or 31

    // Helper: Bond Holder Check
    const isFreeParking = (empCode) => {
        if (!empCode) return false;
        const holder = bondHolders?.find(b => b.employee_code === empCode);
        return holder && (holder.tier === 1 || holder.tier === 2);
    };

    // Helper: Fee & Date Calculation
    const calculateMonthFee = (booking) => {
        const bStart = new Date(booking.booking_start);
        const bEnd = new Date(booking.booking_end);
        
        // 1. Determine Effective Dates for THIS Month
        // If booking starts before Nov 1, effective start is Nov 1.
        const effectiveStart = bStart < startDate ? startDate : bStart;
        
        // If booking ends after Nov 30, effective end is Nov 30.
        const effectiveEnd = bEnd > endDate ? endDate : bEnd;

        // Validation: If no overlap
        if (effectiveStart > effectiveEnd) return null;

        // 2. Calculate Days
        const diffTime = Math.abs(effectiveEnd - effectiveStart);
        const daysOccupied = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

        // 3. Calculate Fee (Prorated based on days in THIS month)
        const price = booking.parking_spots?.price || 0;
        const dailyRate = price / daysInMonth; 
        const totalFee = Math.floor(dailyRate * daysOccupied);

        const empCode = booking.employees?.employee_code;
        const netFee = isFreeParking(empCode) ? 0 : totalFee;

        return { 
            total: totalFee, 
            net: netFee, 
            days: daysOccupied,
            // Return effective dates for display
            displayStart: effectiveStart,
            displayEnd: effectiveEnd
        };
    };

    const monthlyDetails = [];
    const newBookingsDetails = []; 

    let beginning = { count: 0, total: 0, net: 0 };
    let newBook = { count: 0, total: 0, net: 0 };
    let expired = { count: 0, total: 0, net: 0 };
    let ending = { count: 0, total: 0, net: 0 };
    
    let grandTotalRevenue = 0;
    let grandNetRevenue = 0;
    let occupiedReservedCount = 0;

    bookings?.forEach(b => {
        const bStart = new Date(b.booking_start);
        const bEnd = new Date(b.booking_end);
        
        // --- 1. DETAIL REPORT (Using Effective Dates) ---
        const financials = calculateMonthFee(b);
        
        if (financials) {
            grandTotalRevenue += financials.total;
            grandNetRevenue += financials.net;

            monthlyDetails.push({
                ...b,
                effective_start_date: financials.displayStart, // Use capped date
                effective_end_date: financials.displayEnd,     // Use capped date
                display_days: financials.days,
                display_total: financials.total,
                display_net: financials.net
            });
        }

        // --- 2. MOVEMENT LOGIC (Financials included) ---
        // Recalculate or reuse financials? Reuse if valid, else 0
        const mFin = financials || { total: 0, net: 0 };
        
        // A. Beginning Balance
        if (bStart < startDate && bEnd >= startDate) {
            beginning.count++;
            beginning.total += mFin.total;
            beginning.net += mFin.net;
        }

        // B. New Booking
        if (bStart >= startDate && bStart <= endDate) {
            newBook.count++;
            newBook.total += mFin.total;
            newBook.net += mFin.net;

            newBookingsDetails.push({
                employee_code: b.employees?.employee_code || '-',
                full_name: b.employees?.full_name || 'Unknown',
                start_date: b.booking_start, // Keep original start for New Booking report
                end_date: b.booking_end,
                lot_id: b.parking_spots?.lot_id || '-',
                license_plate: b.license_plate_used || b.employees?.license_plate || '-'
            });
        }

        // C. Expired Booking
        if (bEnd >= startDate && bEnd <= endDate) {
            expired.count++;
            expired.total += mFin.total;
            expired.net += mFin.net;
        }

        // D. Ending Balance
        if (bStart <= endDate && bEnd >= endDate) {
             ending.count++;
             ending.total += mFin.total;
             ending.net += mFin.net;

             if (b.parking_spots?.spot_type === 'Reserved (Paid) Parking') {
                 occupiedReservedCount++;
             }
        }
    });

    // --- PARKING INVENTORY ---
    const inventory = {};
    let grandTotalSpots = 0;
    let totalReservedSpots = 0; 

    allSpots?.forEach(spot => {
        grandTotalSpots++;
        if (spot.spot_type === 'Reserved (Paid) Parking') totalReservedSpots++;

        const key = `${spot.zone_text}-${spot.spot_type}`; 
        if (!inventory[key]) {
            inventory[key] = { zone: spot.zone_text, type: spot.spot_type, count: 0 };
        }
        inventory[key].count++;
    });
    
    const sortedInventory = Object.values(inventory).sort((a,b) => a.zone.localeCompare(b.zone));
    const occupancyRate = totalReservedSpots > 0 ? (occupiedReservedCount / totalReservedSpots) * 100 : 0;

    return {
        monthName: startDate.toLocaleString('default', { month: 'long' }),
        year: year,
        monthlyDetails,
        newBookingsDetails,
        movement: [
            { label: 'Beginning Balance', ...beginning },
            { label: 'New Booking', ...newBook },
            { label: 'Expired Booking', ...expired },
            { label: 'Ending Balance', ...ending },
        ],
        inventory: sortedInventory,
        grandTotalSpots,
        financials: { 
            revenue: grandTotalRevenue, 
            net: grandNetRevenue,
            occupancy: occupancyRate,
            occupiedCount: occupiedReservedCount,
            totalReservedSpots: totalReservedSpots
        }
    };
  };

  // --- EXPORT 1: EXCEL ---
  const exportExcel = () => {
    if (!reportData) return;
    const wb = XLSX.utils.book_new();

    // Sheet 1: Tenant Details (Using EFFECTIVE DATES)
    const ws1Data = reportData.monthlyDetails.map(item => ({
        "Lot ID": item.parking_spots?.lot_id,
        "Employee Code": item.employees?.employee_code,
        "Name": item.employees?.full_name,
        // CHANGED: Use effective dates
        "Start Date": new Date(item.effective_start_date).toLocaleDateString(),
        "End Date": new Date(item.effective_end_date).toLocaleDateString(),
        "Days Occupied": item.display_days,
        "Total Fee": item.display_total,
        "Net Fee": item.display_net
    }));
    const ws1 = XLSX.utils.json_to_sheet(ws1Data);
    XLSX.utils.book_append_sheet(wb, ws1, "Tenant Details");

    // Sheet 2: Summary
    const ws2Data = reportData.movement.map(m => ({
        "Description": m.label, 
        "Count (Units)": m.count, 
        "Total Parking Fee (THB)": m.total, 
        "Net Parking Fee (THB)": m.net 
    }));
    const ws2 = XLSX.utils.json_to_sheet(ws2Data);
    XLSX.utils.book_append_sheet(wb, ws2, "Monthly Summary");

    // Sheet 3: New Bookings
    const ws3Data = reportData.newBookingsDetails.map(item => ({
        "Employee Code": item.employee_code,
        "Full Name": item.full_name,
        "Start Date": new Date(item.start_date).toLocaleDateString(),
        "End Date": new Date(item.end_date).toLocaleDateString(),
        "Lot ID": item.lot_id,
        "License Plate": item.license_plate
    }));
    const ws3 = XLSX.utils.json_to_sheet(ws3Data);
    XLSX.utils.book_append_sheet(wb, ws3, "New Bookings");

    const fileName = `TurboParking_Report_${reportData.monthName}_${reportData.year}.xlsx`;
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const data = new Blob([excelBuffer], {type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8'});
    saveAs(data, fileName);
  };

  // --- EXPORT 2: PDF (Fixed) ---
  const exportPDF = () => {
    if (!reportData) return;

    try {
        const doc = new jsPDF();
        
        doc.setFontSize(18);
        doc.text(`Turbo Parking Report: ${reportData.monthName} ${reportData.year}`, 14, 20);
        doc.setFontSize(10);
        doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 28);

        // Table 1: Summary
        doc.setFontSize(14);
        doc.text("3.2 Monthly Booking Summary", 14, 40);
        
        autoTable(doc, {
            startY: 45,
            head: [['Description', 'Count', 'Total Fee', 'Net Fee']],
            body: reportData.movement.map(m => [
                m.label, m.count, m.total.toLocaleString(), m.net.toLocaleString()
            ]),
            theme: 'grid',
            headStyles: { fillColor: [0, 45, 114] }
        });

        // Table 2: New Bookings
        let finalY = (doc.lastAutoTable && doc.lastAutoTable.finalY) || 50; 
        
        doc.text("3.3 New Booking Details", 14, finalY + 15);
        
        autoTable(doc, {
            startY: finalY + 20,
            head: [['Code', 'Name', 'Start', 'End', 'Lot', 'Plate']],
            body: reportData.newBookingsDetails.map(i => [
                i.employee_code, i.full_name, new Date(i.start_date).toLocaleDateString(), new Date(i.end_date).toLocaleDateString(), i.lot_id, i.license_plate
            ]),
            theme: 'striped',
            headStyles: { fillColor: [250, 71, 134] }
        });
        
        doc.save(`TurboParking_${reportData.monthName}.pdf`);
    } catch (err) {
        console.error("PDF Generation Error:", err);
        alert("Failed to export PDF. Please ensure all data is loaded.");
    }
  };

  if (loading || !reportData) return <div className="p-12 text-center text-gray-500">Generating Report...</div>;

  return (
    <div className="space-y-6 animate-in fade-in">
      
      {/* HEADER & FILTERS */}
      <div className="flex justify-between items-center">
        <div>
           <h1 className="text-2xl font-bold text-[#002D72]">Reporting Center</h1>
           <p className="text-gray-500 text-sm flex items-center gap-2 mt-1">
              <Activity size={16} className="text-green-500"/> System Online
           </p>
        </div>

        <div className="flex gap-2 items-center bg-white p-2 rounded-xl border shadow-sm">
            <Calendar size={18} className="text-gray-400 ml-2"/>
            
            <select 
                value={selectedYear} 
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                className="bg-transparent font-medium text-gray-700 outline-none cursor-pointer"
            >
                {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
            </select>

            <span className="text-gray-300">|</span>

            <select 
                value={selectedMonth} 
                onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                className="bg-transparent font-medium text-gray-700 outline-none cursor-pointer"
            >
                {Array.from({length: 12}).map((_, i) => (
                    <option 
                        key={i} 
                        value={i} 
                        disabled={selectedYear === currentYear && i > currentMonth}
                        className={selectedYear === currentYear && i > currentMonth ? "text-gray-300" : ""}
                    >
                        {new Date(0, i).toLocaleString('default', {month: 'long'})}
                    </option>
                ))}
            </select>
        </div>
      </div>

      {/* TABS */}
      <div className="grid grid-cols-3 bg-white p-1 rounded-xl border border-gray-200 shadow-sm">
        {[
            { id: 1, label: 'Booking Transactions', icon: Activity },
            { id: 2, label: 'Parking Summary', icon: BarChart3 }, 
            { id: 3, label: 'Monthly Tenant Report', icon: FileSpreadsheet },
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

      {/* --- TAB 1: BOOKING TRANSACTIONS --- */}
      {activeTab === 1 && (
         <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <Card className="p-6">
                <h3 className="text-lg font-bold text-[#002D72] mb-4">Monthly Booking Movement</h3>
                <table className="w-full text-left">
                    <thead className="bg-gray-50 text-gray-600 border-b">
                        <tr>
                            <th className="py-3 px-4">Description</th>
                            <th className="py-3 px-4 text-center">Count (Unit)</th>
                            <th className="py-3 px-4 text-right">Total Parking Amount (THB)</th>
                            <th className="py-3 px-4 text-right text-green-700">Net Parking Amount (THB)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {reportData.movement.map((row, i) => (
                            <tr key={i} className="border-b hover:bg-gray-50">
                                <td className="py-3 px-4 font-medium text-gray-700">{row.label}</td>
                                <td className="py-3 px-4 text-center font-bold">{row.count}</td>
                                <td className="py-3 px-4 text-right font-mono">{row.total.toLocaleString()}</td>
                                <td className="py-3 px-4 text-right font-mono font-bold text-green-700">{row.net.toLocaleString()}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </Card>

            <div className="grid grid-cols-3 gap-6">
                <Card className="p-6 border-l-4 border-l-blue-500">
                    <p className="text-gray-500 text-sm">Total Revenue</p>
                    <h3 className="text-2xl font-bold text-[#002D72] mt-1">
                        ฿ {reportData.financials.revenue.toLocaleString()}
                    </h3>
                </Card>
                <Card className="p-6 border-l-4 border-l-green-500">
                    <p className="text-gray-500 text-sm">Net Parking Fee</p>
                    <h3 className="text-2xl font-bold text-green-700 mt-1">
                        ฿ {reportData.financials.net.toLocaleString()}
                    </h3>
                </Card>
                <Card className="p-6 border-l-4 border-l-[#FA4786]">
                    <p className="text-gray-500 text-sm">Occupancy (Reserved Only)</p>
                    <div className="flex items-baseline gap-2 mt-1">
                        <h3 className="text-2xl font-bold text-[#FA4786]">
                            {reportData.financials.occupancy.toFixed(1)}%
                        </h3>
                        <span className="text-xs text-gray-400">
                            ({reportData.financials.occupiedCount}/{reportData.financials.totalReservedSpots})
                        </span>
                    </div>
                </Card>
            </div>
         </div>
      )}

      {/* --- TAB 2: PARKING SUMMARY --- */}
      {activeTab === 2 && (
          <Card className="p-6 animate-in fade-in slide-in-from-bottom-4">
            <h3 className="text-lg font-bold text-[#002D72] mb-4">2. Parking Summary</h3>
            <table className="w-full text-left">
                <thead className="bg-[#002D72] text-white">
                    <tr>
                        <th className="py-3 px-4 rounded-tl-lg">Zone</th>
                        <th className="py-3 px-4">Type</th>
                        <th className="py-3 px-4 text-center rounded-tr-lg">Count</th>
                    </tr>
                </thead>
                <tbody className="divide-y">
                    {reportData.inventory.map((row, i) => (
                        <tr key={i}>
                            <td className="py-3 px-4 font-bold text-gray-700">{row.zone}</td>
                            <td className="py-3 px-4 text-gray-500">{row.type}</td>
                            <td className="py-3 px-4 text-center font-bold text-[#002D72]">{row.count}</td>
                        </tr>
                    ))}
                </tbody>
                <tfoot className="bg-gray-100 border-t-2 border-gray-200">
                    <tr>
                        <td colSpan="2" className="py-3 px-4 font-bold text-[#002D72]">Grand Total</td>
                        <td className="py-3 px-4 text-center font-bold text-[#FA4786] text-lg">{reportData.grandTotalSpots}</td>
                    </tr>
                </tfoot>
            </table>
          </Card>
      )}

      {/* --- TAB 3: MONTHLY TENANT REPORT --- */}
      {activeTab === 3 && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
            <div className="flex justify-end gap-3">
                 <button onClick={exportExcel} className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 shadow-sm transition">
                    <FileSpreadsheet size={18} /> Export Excel (3 Sheets)
                 </button>
                 <button onClick={exportPDF} className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 shadow-sm transition">
                    <FileText size={18} /> Export PDF
                 </button>
            </div>

            {/* 3.1 Tenant Detail - USING EFFECTIVE DATES */}
            <Card className="p-6">
                <h3 className="text-lg font-bold text-[#002D72] mb-4">3.1 Monthly Tenant Detail Report</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="py-3 px-4">Lot ID</th>
                                <th className="py-3 px-4">Emp Code</th>
                                <th className="py-3 px-4">Name</th>
                                {/* Changed header to clarify */}
                                <th className="py-3 px-4">Start (Effective)</th>
                                <th className="py-3 px-4">End (Effective)</th>
                                <th className="py-3 px-4 text-right">Total Fee</th>
                                <th className="py-3 px-4 text-right font-bold">Net Fee</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {reportData.monthlyDetails.length === 0 ? <tr><td colSpan="7" className="p-4 text-center text-gray-400">No data</td></tr> :
                            reportData.monthlyDetails.map((row, i) => (
                                <tr key={i} className="hover:bg-gray-50">
                                    <td className="py-3 px-4 font-bold">{row.parking_spots?.lot_id}</td>
                                    <td className="py-3 px-4 font-mono">{row.employees?.employee_code}</td>
                                    <td className="py-3 px-4">{row.employees?.full_name}</td>
                                    {/* USING EFFECTIVE DATES */}
                                    <td className="py-3 px-4 text-gray-500">{new Date(row.effective_start_date).toLocaleDateString()}</td>
                                    <td className="py-3 px-4 text-gray-500">{new Date(row.effective_end_date).toLocaleDateString()}</td>
                                    <td className="py-3 px-4 text-right text-gray-400">{row.display_total.toLocaleString()}</td>
                                    <td className="py-3 px-4 text-right font-bold text-[#002D72] bg-blue-50">{row.display_net.toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>

            <Card className="p-6">
                <h3 className="text-lg font-bold text-[#002D72] mb-4">3.2 Monthly Booking Summary</h3>
                <table className="w-full text-left">
                    <thead className="bg-gray-50 border-b">
                        <tr>
                            <th className="py-3 px-4">Description</th>
                            <th className="py-3 px-4 text-center">Count (Units)</th>
                            <th className="py-3 px-4 text-right">Total Parking Fee (THB)</th>
                            <th className="py-3 px-4 text-right">Net Parking Fee (THB)</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {reportData.movement.map((m, i) => (
                            <tr key={i}>
                                <td className="py-3 px-4 font-medium">{m.label}</td>
                                <td className="py-3 px-4 text-center font-bold">{m.count}</td>
                                <td className="py-3 px-4 text-right">{m.total.toLocaleString()}</td>
                                <td className="py-3 px-4 text-right font-bold text-green-700">{m.net.toLocaleString()}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </Card>

            <Card className="p-6">
                <h3 className="text-lg font-bold text-[#002D72] mb-4">3.3 New Booking Details</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="py-3 px-4">Employee Code</th>
                                <th className="py-3 px-4">Full Name</th>
                                <th className="py-3 px-4">Start Date</th>
                                <th className="py-3 px-4">End Date</th>
                                <th className="py-3 px-4">Lot ID</th>
                                <th className="py-3 px-4">License Plate</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {reportData.newBookingsDetails.length === 0 ? <tr><td colSpan="6" className="p-4 text-center text-gray-400">No new bookings this month.</td></tr> :
                             reportData.newBookingsDetails.map((row, i) => (
                                <tr key={i} className="hover:bg-gray-50">
                                    <td className="py-3 px-4 font-mono text-blue-600">{row.employee_code}</td>
                                    <td className="py-3 px-4 font-medium">{row.full_name}</td>
                                    <td className="py-3 px-4">{new Date(row.start_date).toLocaleDateString()}</td>
                                    <td className="py-3 px-4">{new Date(row.end_date).toLocaleDateString()}</td>
                                    <td className="py-3 px-4 font-bold">{row.lot_id}</td>
                                    <td className="py-3 px-4 text-gray-500">{row.license_plate}</td>
                                </tr>
                             ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
      )}
    </div>
  );
}