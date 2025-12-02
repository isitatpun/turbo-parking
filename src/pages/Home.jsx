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
import autoTable from 'jspdf-autotable';

// IMPORTANT: You must have this file created with the Base64 string of Sarabun.ttf
import { fontBase64 } from '../lib/ThaiFont'; 

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(1);
  const [reportData, setReportData] = useState(null);
  
  // --- DATE FILTER STATE ---
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth(); 
  
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);

  const startYear = 2024;
  const years = [];
  for (let y = startYear; y <= currentYear; y++) {
      years.push(y);
  }

  // Safety Check for future dates
  useEffect(() => {
    if (selectedYear > currentYear) {
        setSelectedYear(currentYear);
    }
    if (selectedYear === currentYear && selectedMonth > currentMonth) {
        setSelectedMonth(currentMonth);
    }
  }, [selectedYear, currentYear, currentMonth]);

  useEffect(() => {
    fetchReportData();
  }, [selectedYear, selectedMonth]);

  const fetchReportData = async () => {
    try {
      setLoading(true);

      // 1. Fetch Data with Deleted Filter
      const [bookingsRes, spotsRes, bondRes] = await Promise.all([
        supabase.from('bookings')
          .select(`
            *, 
            employees (employee_code, full_name, license_plate, employee_type), 
            parking_spots (lot_id, price, zone_text, spot_type)
          `)
          .eq('is_deleted', false), // <--- FILTER DELETED
        
        supabase.from('parking_spots').select('*'),
        supabase.from('bond_holders').select('employee_code, tier')
      ]);

      if (bookingsRes.error) throw bookingsRes.error;

      // 2. Process Data
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
    } finally {
      setLoading(false);
    }
  };

  // --- HELPERS ---
  const formatThaiDate = (dateObj) => {
    if (!dateObj) return '-';
    return new Date(dateObj).toLocaleDateString('en-GB', { 
        timeZone: 'Asia/Bangkok' 
    });
  };

  const formatMoney = (amount) => {
      // Formats to 2 decimal places (e.g. 1,200.00)
      return (amount || 0).toLocaleString(undefined, { 
          minimumFractionDigits: 2, 
          maximumFractionDigits: 2 
      });
  };

  const toMidnight = (dateInput) => {
    const d = new Date(dateInput);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  // --- CORE LOGIC ENGINE ---
  const processMonthlyData = (bookings, allSpots, bondHolders, year, month) => {
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0); 
    const daysInMonth = monthEnd.getDate();

    // Logic: Free Parking if Management OR Bond Holder Tier 1/2
    const isFreeParking = (empCode, empType) => {
        if (empType === 'Management') return true;
        if (!empCode) return false;
        const holder = bondHolders?.find(b => b.employee_code === empCode);
        return holder && (holder.tier === 1 || holder.tier === 2);
    };

    // Logic: Get Privilege Text
    const getPrivilegeText = (empCode) => {
        if (!empCode) return '-';
        const holder = bondHolders?.find(b => b.employee_code === empCode);
        return holder ? `Bond Holder Tier ${holder.tier}` : '-';
    };

    let beg = { count: 0, total: 0, net: 0 };
    let newB = { count: 0, total: 0, net: 0 }; 
    let exp = { count: 0, total: 0, net: 0 }; 
    
    const monthlyDetails = [];
    const newBookingsDetails = []; 

    let grandTotalRevenue = 0;
    let grandNetRevenue = 0;
    let occupiedReservedCount = 0;
    
    const todayMidnight = toMidnight(new Date());
    let reportCapDate = monthEnd;
    if (monthEnd > todayMidnight) {
        reportCapDate = todayMidnight;
    }

    bookings?.forEach(b => {
        const bStart = toMidnight(b.booking_start);
        const bEnd = toMidnight(b.booking_end);
        
        const price = b.parking_spots?.price || 0;
        const dailyRate = price / daysInMonth;
        
        const empCode = b.employees?.employee_code;
        const empType = b.employees?.employee_type || '-';
        
        const isFree = isFreeParking(empCode, empType);
        const privilegeText = getPrivilegeText(empCode);

        // --- A. MOVEMENT ---
        // Beginning
        if (bStart < monthStart && bEnd >= monthStart) {
            beg.count++;
            const fee = price; 
            const net = isFree ? 0 : fee;
            beg.total += fee;
            beg.net += net;
        }

        // New
        if (bStart >= monthStart && bStart <= monthEnd) {
            newB.count++;
            const diffTime = monthEnd.getTime() - bStart.getTime();
            const daysActive = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;
            const fee = Math.floor(dailyRate * daysActive);
            const net = isFree ? 0 : fee;

            newB.total += fee;
            newB.net += net;

            newBookingsDetails.push({
                ...b,
                start_date: b.booking_start,
                end_date: b.booking_end
            });
        }

        // Expired
        if (bEnd >= monthStart && bEnd < monthEnd) {
            exp.count++;
            const diffTime = monthEnd.getTime() - bEnd.getTime();
            const daysLost = Math.round(diffTime / (1000 * 60 * 60 * 24)); 
            const lostFee = Math.floor(dailyRate * daysLost) * -1;
            const lostNet = isFree ? 0 : lostFee;

            exp.total += lostFee;
            exp.net += lostNet;
        }

        // --- B. MONTHLY TENANT DETAILS ---
        const effectiveStart = bStart > monthStart ? bStart : monthStart;
        const effectiveLimit = bEnd < reportCapDate ? bEnd : reportCapDate;
        const effectiveEnd = effectiveLimit; 

        if (effectiveStart <= effectiveEnd) {
            const diffTime = effectiveEnd.getTime() - effectiveStart.getTime();
            const daysOccupied = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;
            const totalFee = Math.floor(dailyRate * daysOccupied);
            const netFee = isFree ? 0 : totalFee;

            grandTotalRevenue += totalFee;
            grandNetRevenue += netFee;

            monthlyDetails.push({
                ...b,
                effective_start_date: effectiveStart,
                effective_end_date: effectiveEnd,
                display_days: daysOccupied,
                display_total: totalFee,
                display_net: netFee,
                display_type: empType,        // Added
                display_privilege: privilegeText // Added
            });

            if (bEnd >= reportCapDate && b.parking_spots?.spot_type === 'Reserved (Paid) Parking') {
                occupiedReservedCount++;
            }
        }
    });

    const end = {
        count: beg.count + newB.count - exp.count, 
        total: beg.total + newB.total + exp.total, 
        net: beg.net + newB.net + exp.net
    };

    const inventory = {};
    let grandTotalSpots = 0;
    let totalReservedSpots = 0; 

    allSpots?.forEach(spot => {
        grandTotalSpots++;
        if (spot.spot_type === 'Reserved (Paid) Parking') totalReservedSpots++;
        const key = `${spot.zone_text}-${spot.spot_type}`; 
        if (!inventory[key]) inventory[key] = { zone: spot.zone_text, type: spot.spot_type, count: 0 };
        inventory[key].count++;
    });
    
    const sortedInventory = Object.values(inventory).sort((a,b) => a.zone.localeCompare(b.zone));
    const occupancyRate = totalReservedSpots > 0 ? (occupiedReservedCount / totalReservedSpots) * 100 : 0;

    return {
        monthName: monthStart.toLocaleString('default', { month: 'long' }),
        year: year,
        monthlyDetails,
        newBookingsDetails,
        movement: [
            { label: 'Beginning Balance', ...beg },
            { label: 'New Booking', ...newB },
            { label: 'Expired Booking (Missed Rev)', ...exp },
            { label: 'Ending Balance', ...end },
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

    const ws1Data = reportData.monthlyDetails.map(item => ({
        "Lot ID": item.parking_spots?.lot_id,
        "Employee Code": item.employees?.employee_code,
        "Name": item.employees?.full_name,
        "Type": item.display_type,          // <--- ADDED
        "Privilege": item.display_privilege, // <--- ADDED
        "Start Date (Effective)": formatThaiDate(item.effective_start_date),
        "End Date (Effective)": formatThaiDate(item.effective_end_date),
        "Days": item.display_days,
        "Total Fee": item.display_total, 
        "Net Fee": item.display_net
    }));
    const ws1 = XLSX.utils.json_to_sheet(ws1Data);
    XLSX.utils.book_append_sheet(wb, ws1, "Tenant Details");

    const ws2Data = reportData.movement.map(m => ({
        "Description": m.label, 
        "Count": m.count, 
        "Total Fee": m.total, 
        "Net Fee": m.net 
    }));
    const ws2 = XLSX.utils.json_to_sheet(ws2Data);
    XLSX.utils.book_append_sheet(wb, ws2, "Monthly Summary");

    const ws3Data = reportData.newBookingsDetails.map(item => ({
        "Code": item.employees?.employee_code,
        "Name": item.employees?.full_name,
        "Start": formatThaiDate(item.start_date),
        "End": formatThaiDate(item.end_date),
        "Lot": item.parking_spots?.lot_id,
        "Plate": item.license_plate_used || item.employees?.license_plate
    }));
    const ws3 = XLSX.utils.json_to_sheet(ws3Data);
    XLSX.utils.book_append_sheet(wb, ws3, "New Bookings");

    const fileName = `TurboParking_Report_${reportData.monthName}_${reportData.year}.xlsx`;
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const data = new Blob([excelBuffer], {type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8'});
    saveAs(data, fileName);
  };

  // --- EXPORT 2: PDF ---
  const exportPDF = () => {
    if (!reportData) return;
    try {
        const doc = new jsPDF('l'); // Landscape orientation

        // 1. Register Thai Font (Sarabun)
        // Ensure you have src/lib/ThaiFont.js with the Base64 string
        doc.addFileToVFS("Sarabun-Regular.ttf", fontBase64);
        doc.addFont("Sarabun-Regular.ttf", "Sarabun", "normal");
        doc.setFont("Sarabun");

        // Header
        doc.setFontSize(18);
        doc.text(`Turbo Parking Report: ${reportData.monthName} ${reportData.year}`, 14, 20);
        doc.setFontSize(10);
        doc.text(`Generated on: ${new Date().toLocaleString('en-GB', {timeZone: 'Asia/Bangkok'})}`, 14, 28);

        // --- 3.1 Monthly Tenant Detail Report ---
        doc.setFontSize(14);
        doc.text("3.1 Monthly Tenant Detail Report", 14, 40);
        
        autoTable(doc, {
            startY: 45,
            head: [['Lot', 'Code', 'Name', 'Type', 'Privilege', 'Start', 'End', 'Total', 'Net']],
            body: reportData.monthlyDetails.map(item => [
                item.parking_spots?.lot_id,
                item.employees?.employee_code,
                item.employees?.full_name,
                item.display_type,       // <--- ADDED
                item.display_privilege,  // <--- ADDED
                formatThaiDate(item.effective_start_date),
                formatThaiDate(item.effective_end_date),
                formatMoney(item.display_total), // <--- 2 DECIMAL
                formatMoney(item.display_net)    // <--- 2 DECIMAL
            ]),
            theme: 'striped',
            // 2. Apply Thai Font to Table
            styles: { 
                font: 'Sarabun', 
                fontSize: 8 
            }, 
            headStyles: { fillColor: [0, 45, 114] },
            columnStyles: {
                7: { halign: 'right' },
                8: { halign: 'right' }
            }
        });

        // --- 3.2 Monthly Booking Summary ---
        let finalY = (doc.lastAutoTable && doc.lastAutoTable.finalY) || 50;
        doc.setFontSize(14);
        doc.text("3.2 Monthly Booking Summary", 14, finalY + 15);
        
        autoTable(doc, {
            startY: finalY + 20,
            head: [['Description', 'Count', 'Total Fee', 'Net Fee']],
            body: reportData.movement.map(m => [
                m.label, 
                m.count, 
                formatMoney(m.total),
                formatMoney(m.net)
            ]),
            theme: 'grid',
            styles: { font: 'Sarabun' },
            headStyles: { fillColor: [0, 45, 114] },
            columnStyles: {
                2: { halign: 'right' },
                3: { halign: 'right' }
            }
        });

        // --- 3.3 New Booking Details ---
        finalY = doc.lastAutoTable.finalY; 
        doc.text("3.3 New Booking Details", 14, finalY + 15);
        
        autoTable(doc, {
            startY: finalY + 20,
            head: [['Code', 'Name', 'Start', 'End', 'Lot', 'Plate']],
            body: reportData.newBookingsDetails.map(i => [
                i.employees?.employee_code, 
                i.employees?.full_name, 
                formatThaiDate(i.start_date), 
                formatThaiDate(i.end_date), 
                i.parking_spots?.lot_id, 
                i.license_plate_used || i.employees?.license_plate
            ]),
            theme: 'striped',
            styles: { font: 'Sarabun' },
            headStyles: { fillColor: [250, 71, 134] }
        });
        
        doc.save(`TurboParking_${reportData.monthName}.pdf`);
    } catch (err) {
        console.error("PDF Error:", err);
    }
  };

  if (loading || !reportData) return <div className="p-12 text-center text-gray-500">Generating Report...</div>;

  return (
    <div className="space-y-6 animate-in fade-in">
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
                {years.map(y => <option key={y} value={y}>{y}</option>)}
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
                                <td className={`py-3 px-4 text-right font-mono ${row.total < 0 ? 'text-red-500' : ''}`}>
                                    {formatMoney(row.total)}
                                </td>
                                <td className={`py-3 px-4 text-right font-mono font-bold ${row.net < 0 ? 'text-red-500' : 'text-green-700'}`}>
                                    {formatMoney(row.net)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </Card>

            <div className="grid grid-cols-3 gap-6">
                <Card className="p-6 border-l-4 border-l-blue-500">
                    <p className="text-gray-500 text-sm">Total Revenue</p>
                    <h3 className="text-2xl font-bold text-[#002D72] mt-1">฿ {formatMoney(reportData.financials.revenue)}</h3>
                </Card>
                <Card className="p-6 border-l-4 border-l-green-500">
                    <p className="text-gray-500 text-sm">Net Parking Fee</p>
                    <h3 className="text-2xl font-bold text-green-700 mt-1">฿ {formatMoney(reportData.financials.net)}</h3>
                </Card>
                <Card className="p-6 border-l-4 border-l-[#FA4786]">
                    <p className="text-gray-500 text-sm">Occupancy (Reserved Only)</p>
                    <div className="flex items-baseline gap-2 mt-1">
                        <h3 className="text-2xl font-bold text-[#FA4786]">{reportData.financials.occupancy.toFixed(1)}%</h3>
                        <span className="text-xs text-gray-400">({reportData.financials.occupiedCount}/{reportData.financials.totalReservedSpots})</span>
                    </div>
                </Card>
            </div>
         </div>
      )}

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

      {activeTab === 3 && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
            <div className="flex justify-end gap-3">
                 <button onClick={exportExcel} className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 shadow-sm transition"><FileSpreadsheet size={18} /> Export Excel (3 Sheets)</button>
                 <button onClick={exportPDF} className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 shadow-sm transition"><FileText size={18} /> Export PDF</button>
            </div>

            <Card className="p-6">
                <h3 className="text-lg font-bold text-[#002D72] mb-4">3.1 Monthly Tenant Detail Report</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="py-3 px-4">Lot ID</th>
                                <th className="py-3 px-4">Emp Code</th>
                                <th className="py-3 px-4">Name</th>
                                <th className="py-3 px-4">Type</th>
                                <th className="py-3 px-4">Privilege</th>
                                <th className="py-3 px-4">Start (Effective)</th>
                                <th className="py-3 px-4">End (Effective)</th>
                                <th className="py-3 px-4 text-right">Total Fee</th>
                                <th className="py-3 px-4 text-right font-bold">Net Fee</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {reportData.monthlyDetails.length === 0 ? <tr><td colSpan="9" className="p-4 text-center text-gray-400">No data</td></tr> :
                            reportData.monthlyDetails.map((row, i) => (
                                <tr key={i} className="hover:bg-gray-50">
                                    <td className="py-3 px-4 font-bold">{row.parking_spots?.lot_id}</td>
                                    <td className="py-3 px-4 font-mono">{row.employees?.employee_code}</td>
                                    <td className="py-3 px-4">{row.employees?.full_name}</td>
                                    <td className="py-3 px-4 text-gray-600">{row.display_type}</td>
                                    <td className="py-3 px-4 text-blue-600 text-xs font-semibold">{row.display_privilege}</td>
                                    <td className="py-3 px-4 text-gray-500">{formatThaiDate(row.effective_start_date)}</td>
                                    <td className="py-3 px-4 text-gray-500">{formatThaiDate(row.effective_end_date)}</td>
                                    <td className="py-3 px-4 text-right text-gray-400">{formatMoney(row.display_total)}</td>
                                    <td className="py-3 px-4 text-right font-bold text-[#002D72] bg-blue-50">{formatMoney(row.display_net)}</td>
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
                                <td className={`py-3 px-4 text-right ${m.total < 0 ? 'text-red-500' : ''}`}>
                                    {formatMoney(m.total)}
                                </td>
                                <td className={`py-3 px-4 text-right font-bold ${m.net < 0 ? 'text-red-500' : 'text-green-700'}`}>
                                    {formatMoney(m.net)}
                                </td>
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
                                    <td className="py-3 px-4 font-mono text-blue-600">{row.employees?.employee_code}</td>
                                    <td className="py-3 px-4 font-medium">{row.employees?.full_name}</td>
                                    <td className="py-3 px-4">{formatThaiDate(row.start_date)}</td>
                                    <td className="py-3 px-4">{formatThaiDate(row.end_date)}</td>
                                    <td className="py-3 px-4 font-bold">{row.parking_spots?.lot_id}</td>
                                    <td className="py-3 px-4 text-gray-500">{row.license_plate_used || row.employees?.license_plate}</td>
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