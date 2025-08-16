import React, { useState, useEffect } from 'react';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, useSortable, rectSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import * as XLSX from 'xlsx';
import allocateWorkers from '../services/scheduler';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import './Dashboard.css';
import { supabase }  from '../supabaseClient';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

// SortableItem component for each table cell
const SortableItem = ({ id, worker, day, daySchedule, stationColor, handleChange, setFocusedFieldValue, calculateShiftDuration }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    backgroundColor: stationColor,
    opacity: isDragging ? 0.6 : 1,
    border: isDragging ? '2px dashed #888' : '1px solid #ddd',
  };

  const shiftDuration = calculateShiftDuration(daySchedule.time);

  return (
    <td
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={daySchedule.location === 'Unassigned' ? 'unassigned' : 'scheduled'}
    >
      <div>
        <input
          type="text"
          value={daySchedule.location !== 'Unassigned' ? daySchedule.location : ''}
          onFocus={() =>
            setFocusedFieldValue({
              worker,
              day,
              field: 'location',
              value: daySchedule.location,
            })
          }
          onChange={(e) => handleChange(worker, day, 'location', e.target.value)}
          placeholder="Location"
        />
        <input
          type="text"
          value={daySchedule.time}
          onFocus={() =>
            setFocusedFieldValue({
              worker,
              day,
              field: 'time',
              value: daySchedule.time,
            })
          }
          onChange={(e) => handleChange(worker, day, 'time', e.target.value)}
          placeholder="Time"
        />
        <span className="shift-duration">
          {daySchedule.time && shiftDuration !== '0.00' ? `${shiftDuration}` : '—'}
        </span>
      </div>
    </td>
  );
};

const Dashboard = () => {
  const [schedule, setSchedule] = useState({});
  const [stationColors, setStationColors] = useState({});
  const [successMessage, setSuccessMessage] = useState('');  // New state for success message
  const [isNewScheduleGenerated, setIsNewScheduleGenerated] = useState(false);  // State for tracking new schedule
  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const [datesOfWeek, setDatesOfWeek] = useState({});
  const [showSearch, setShowSearch] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [weekEndingDate, setWeekEndingDate] = useState('');
  const [unassignedStations, setUnassignedStations] = useState([]);
  const workersData = JSON.parse(localStorage.getItem('uploadedWorkers')) || []; 
  const uniqueWorkers = [...new Set(workersData.map(worker => worker.name))];
  const [auditLogBuffer, setAuditLogBuffer] = useState([]);
  const [auditEntries, setAuditEntries] = useState([]);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [focusedFieldValue, setFocusedFieldValue] = useState(null);

  useEffect(() => {
    const saved = localStorage.getItem('workerSchedule');
    if (saved) {
      const parsed = JSON.parse(saved);
      setSchedule(parsed);
      assignStationColors(parsed);
  
      // Extract datesOfWeek from parsed schedule
      const newDatesOfWeek = {};
      Object.keys(parsed).forEach((worker) => {
        daysOfWeek.forEach((day) => {
          const entry = parsed[worker][day];
          if (entry?.date && !newDatesOfWeek[day]) {
            newDatesOfWeek[day] = entry.date;
          }
        });
      });
      setDatesOfWeek(newDatesOfWeek);
    } else {
      const allocatedSchedule = allocateWorkers();
      const formattedSchedule = formatSchedule(allocatedSchedule);
      setSchedule(formattedSchedule);
      assignStationColors(formattedSchedule);
    }
  }, []);
  
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);


  const formatSchedule = async (allocatedSchedule) => {
    const formattedSchedule = {};
  
    // Step 1: Fill in assigned workers
    allocatedSchedule.forEach((station) => {
      if (station.allocatedTo && station.allocatedTo !== 'Unassigned') {
        const worker = station.allocatedTo;
  
        if (!formattedSchedule[worker]) {
          formattedSchedule[worker] = {};
        }
  
        formattedSchedule[worker][station.day] = {
          location: station.location,
          time: station.time,
          date: station.date,
        };
      }
    });
  
    // Step 2: Fill in unassigned days for workers who were assigned
    Object.keys(formattedSchedule).forEach((worker) => {
      daysOfWeek.forEach((day) => {
        if (!formattedSchedule[worker][day]) {
          formattedSchedule[worker][day] = {
            location: 'Unassigned',
            time: '',
          };
        }
      });
    });
  
    // ✅ Step 3: Ensure all uploaded workers are included from Supabase
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session?.user) {
      throw new Error("User not logged in");
    }
  
    const userId = session.user.id;
  
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', userId)
      .single();
  
    if (profileError || !profile) {
      throw new Error("Could not fetch user profile");
    }
  
    const organizationId = profile.organization_id;
  
    const { data: workersData, error: workerError } = await supabase
      .from('workers')
      .select('name')
      .eq('organization_id', organizationId);
  
    if (workerError) {
      throw new Error("Could not fetch workers");
    }
    // Step 2: Fetch unique dates from the stations table for the organization
    const { data: stations, error: stationsError } = await supabase
    .from('stations')
    .select('date', { distinct: true })
    .eq('organization_id', organizationId);

if (stationsError) {
  throw new Error("Could not fetch stations data");
}

// Step 3: Map the unique dates to the corresponding days of the week
const uniqueDates = [...new Set(stations.map(row => row.date))].sort((a, b) => new Date(a) - new Date(b));
const newDatesOfWeek = {};
daysOfWeek.forEach((day, index) => {
  const date = uniqueDates[index];
  if (date) {
    newDatesOfWeek[day] = date;
  }
});

setDatesOfWeek(newDatesOfWeek);
    const workers = JSON.parse(JSON.stringify(workersData)); // Keep consistent with original code
  
    workers.forEach((worker) => {
      const workerName = worker.name;
  
      if (!formattedSchedule[workerName]) {
        formattedSchedule[workerName] = {};
  
        daysOfWeek.forEach((day) => {
          formattedSchedule[workerName][day] = {
            location: 'Unassigned',
            time: '',
            date: newDatesOfWeek[day] || '',
          };
        });
      }
    });
  
    return formattedSchedule;
  };
  
  const predefinedStationColors = {
  "CHARING CROSS": "#9BC1E6",
  "GRAVESEND": "#D4A6BD",
  "FAVERSHAM": "#FFFF00",
  "LONDON BRIDGE": "#ED7D31",
  "WATERLOO EAST": "#93C47D",
  "ROCHESTER": "#FF00FF",
  "ALBANY PARK": "#9900FF",
  "DARTFORD": "#00FFFF",
  "VICTORIA": "#3D85C6",
  "GILLINGHAM": "#69A84F",
  "CHATHAM": "#BF9000",
  "SITTINGBOURNE": "#D4A5BD",
  "CANTERBURY EAST": "#F0C131",


  
  
  // Add more as needed
};


  const assignStationColors = (formattedSchedule) => {
  const uniqueStations = new Set();

  Object.keys(formattedSchedule).forEach((worker) => {
    daysOfWeek.forEach((day) => {
      const station = formattedSchedule[worker][day].location;
      if (station && station !== 'Unassigned') {
        uniqueStations.add(station);
      }
    });
  });

  const newStationColors = {};

  uniqueStations.forEach((station) => {
  const upperCaseStation = station.toUpperCase();
  if (predefinedStationColors[upperCaseStation]) {
    newStationColors[station] = predefinedStationColors[upperCaseStation];
  } else {
    // Optional fallback
    newStationColors[station] = "#cccccc";
  }
});


  setStationColors(newStationColors);
};


  const generateUniqueColors = (numColors) => {
    const colors = [];
    const baseColors = [
      '#f44336', '#4caf50', '#2196f3', '#ff9800', '#9c27b0', '#00bcd4', 
      '#8bc34a', '#ff5722', '#3f51b5', '#673ab7', '#ffeb3b', '#cddc39'
    ];

    for (let i = 0; i < numColors; i++) {
      colors.push(baseColors[i % baseColors.length]);
    }

    return colors;
  };


  const calculateShiftDuration = (timeRange) => {
  if (!timeRange || !timeRange.includes('-')) return '0.00';

  const [start, end] = timeRange.split('-');
  if (!start || !end) return '0.00';

  const startHour = parseInt(start.slice(0, 2), 10);
  const startMin = parseInt(start.slice(2), 10);
  const endHour = parseInt(end.slice(0, 2), 10);
  const endMin = parseInt(end.slice(2), 10);

  let startDate = new Date(0, 0, 0, startHour, startMin);
  let endDate = new Date(0, 0, 0, endHour, endMin);

  if (endDate <= startDate) {
    endDate = new Date(0, 0, 1, endHour, endMin); // Handle midnight crossing
  }

  const diff = (endDate - startDate) / (1000 * 60 * 60);
  return isNaN(diff) ? '0.00' : diff.toFixed(2);
};

  const calculateHoursWorked = (workerSchedule) => {
  let totalHours = 0;
  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  daysOfWeek.forEach((day) => {
    const entry = workerSchedule[day];
    const timeRange = entry?.time;

    if (timeRange && timeRange.includes('-')) {
      const [start, end] = timeRange.split('-');

      if (start && end) {
        const startHour = parseInt(start.slice(0, 2), 10);
        const startMin = parseInt(start.slice(2), 10);
        const endHour = parseInt(end.slice(0, 2), 10);
        const endMin = parseInt(end.slice(2), 10);

        let startDate = new Date(0, 0, 0, startHour, startMin);
        let endDate = new Date(0, 0, 0, endHour, endMin);

        // If end time is earlier than start time, assume it crosses midnight
        if (endDate <= startDate) {
          endDate = new Date(0, 0, 1, endHour, endMin); // Add one day to endDate
        }

        const diff = (endDate - startDate) / (1000 * 60 * 60);

        if (!isNaN(diff)) {
          totalHours += diff;
        }
      }
    }
  });

  return totalHours.toFixed(2);
};
// Blend hex color with white by given opacity (0-1)

const blendWithWhite = (hex, opacity) => {
  hex = hex.replace(/^#/, '');
  if (hex.length === 3) {
    hex = hex.split('').map((c) => c + c).join('');
  }
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);

  const rBlended = Math.round(r + (255 - r) * opacity);
  const gBlended = Math.round(g + (255 - g) * opacity);
  const bBlended = Math.round(b + (255 - b) * opacity);

  const toHex = (n) => n.toString(16).padStart(2, '0');

  return 'FF' + toHex(rBlended) + toHex(gBlended) + toHex(bBlended);
};

const normalizeToARGB = (colorInput) => {
  if (!colorInput) return 'FFF1F1F1';
  let s = String(colorInput).trim();

  const rgbMatch = s.match(/^rgb\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})\)$/i);
  if (rgbMatch) {
    const r = Number(rgbMatch[1]).toString(16).padStart(2, '0');
    const g = Number(rgbMatch[2]).toString(16).padStart(2, '0');
    const b = Number(rgbMatch[3]).toString(16).padStart(2, '0');
    return ('FF' + r + g + b).toUpperCase();
  }

  if (s.startsWith('#')) s = s.slice(1);
  s = s.toUpperCase();

  if (s.length === 3) {
    s = s.split('').map((c) => c + c).join('');
  }

  if (s.length === 6) return 'FF' + s;
  if (s.length === 8) return s;

  return 'FFF1F1F1';
};

const exportToExcel = async () => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Schedule');

  /** -----------------------
 *  HEADER BLOCK / TITLE
 * ----------------------- */
// Merge across full table width (daysOfWeek + 2 extra cols)
const totalCols = daysOfWeek.length + 2;

// Row 1: Title
worksheet.mergeCells(1, 1, 1, totalCols);
const titleCell = worksheet.getCell(1, 1);
titleCell.value = 'Temporary Worker Timesheet & Roster';
titleCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
titleCell.font = { bold: true, size: 16, name: 'Arial', color: { argb: 'FF000000' } };
titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD3D3D3' } };
titleCell.border = {
  top: { style: 'thin', color: { argb: 'FF212121' } },
  left: { style: 'thin', color: { argb: 'FF212121' } },
  bottom: { style: 'thin', color: { argb: 'FF212121' } },
  right: { style: 'thin', color: { argb: 'FF212121' } },
};

// Row 2: Empty spacer row (merged + filled, no borders)
worksheet.addRow([]);
worksheet.mergeCells(2, 1, 2, totalCols);
const spacerCell = worksheet.getCell(2, 1);
spacerCell.value = '';
spacerCell.fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFD3D3D3' },
};
spacerCell.alignment = { vertical: 'middle', horizontal: 'center' };
worksheet.getRow(2).height = 20;

// Row 3: "Our Reference:" (left) | "Client:" (right)
worksheet.mergeCells(3, 1, 3, Math.floor(totalCols / 2));
worksheet.mergeCells(3, Math.floor(totalCols / 2) + 1, 3, totalCols);
worksheet.getCell(3, 1).value = 'Our Reference:';
worksheet.getCell(3, Math.floor(totalCols / 2) + 1).value = 'Client:';

// Row 4: "Job Title:" (left) | "Purchase Order:" (right)
worksheet.mergeCells(4, 1, 4, Math.floor(totalCols / 2));
worksheet.mergeCells(4, Math.floor(totalCols / 2) + 1, 4, totalCols);
worksheet.getCell(4, 1).value = 'Job Title:';
worksheet.getCell(4, Math.floor(totalCols / 2) + 1).value = 'Purchase Order:';

// Row 5: empty left | "Week Ending Date:" (right)
worksheet.mergeCells(5, 1, 5, Math.floor(totalCols / 2));
worksheet.mergeCells(5, Math.floor(totalCols / 2) + 1, 5, totalCols);
worksheet.getCell(5, Math.floor(totalCols / 2) + 1).value = 'Week Ending Date:';

// Style for rows 3–5
for (let r = 3; r <= 5; r++) {
  const row = worksheet.getRow(r);
  row.height = 20;
  row.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD3D3D3' },
    };
    cell.font = { bold: false, size: 12, name: 'Arial', color: { argb: 'FF000000' } };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF212121' } },
      left: { style: 'thin', color: { argb: 'FF212121' } },
      bottom: { style: 'thin', color: { argb: 'FF212121' } },
      right: { style: 'thin', color: { argb: 'FF212121' } },
    };
  });
}


  /** -----------------------
   *  SCHEDULE TABLE HEADERS
   * ----------------------- */
  const headers = ['Day', ...daysOfWeek, '72h Limit'];
  const datesRow = ['Date', ...daysOfWeek.map((day) => datesOfWeek[day] || '—'), 'Total Hours'];

  worksheet.addRow([]);
  worksheet.addRow(headers);
  worksheet.addRow(datesRow);

  // Adjust header styling (rows 6 and 7 now, since 1–4 are the block and 5 is empty)
  const headerStartRow = worksheet.lastRow.number - 1;
  [headerStartRow, headerStartRow + 1].forEach((rowNum) => {
    const row = worksheet.getRow(rowNum);
    row.font = { bold: true, size: 12, name: 'Arial', color: { argb: 'FF212121' } };
    row.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF212121' } },
        left: { style: 'thin', color: { argb: 'FF212121' } },
        bottom: { style: 'thin', color: { argb: 'FF212121' } },
        right: { style: 'thin', color: { argb: 'FF212121' } },
      };
    });
  });

  /** -----------------------
   *  WORKER ROWS
   * ----------------------- */
  Object.keys(schedule).forEach((worker) => {
    const startRow = worksheet.lastRow.number + 1;

    // Time row
    const timeRow = [worker];
    daysOfWeek.forEach((day) => {
      const { time } = schedule[worker][day] || {};
      timeRow.push(time || '—');
    });
    timeRow.push('');
    worksheet.addRow(timeRow);

    // Location row
    const locationRowValues = [''];
    daysOfWeek.forEach((day) => {
      const loc = (schedule[worker][day] && schedule[worker][day].location) || '—';
      locationRowValues.push(loc);
    });
    locationRowValues.push(''); // No "72h limit" repeat here
    const locRowRef = worksheet.addRow(locationRowValues);

    daysOfWeek.forEach((day, idx) => {
      const colIndex = idx + 2;
      const cell = locRowRef.getCell(colIndex);
      const locVal = locationRowValues[colIndex - 1] ?? '';

      let baseColor = '#f1f1f1';
      try {
        if (typeof getStationColor === 'function') baseColor = getStationColor(locVal) || baseColor;
      } catch {
        baseColor = '#f1f1f1';
      }

      const argb = normalizeToARGB(baseColor); // Returns ARGB with full opacity


      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
    });

    // Hours row
    const hoursRow = ['Hours Worked'];
    daysOfWeek.forEach((day) => {
      const time = schedule[worker][day] && schedule[worker][day].time;
      const duration = calculateShiftDuration(time);
      hoursRow.push(time && duration !== '0.00' ? `${duration}` : '—');
    });
    hoursRow.push(calculateHoursWorked(schedule[worker]));
    worksheet.addRow(hoursRow);
    // Set custom row heights for worker block
worksheet.getRow(startRow).height = 70;       // Time row
worksheet.getRow(startRow + 1).height = 50;   // Location row
worksheet.getRow(startRow + 2).height = 30;   // Hours row


    // Merge worker name cells
    worksheet.mergeCells(`A${startRow}:A${startRow + 1}`);

    // Style worker block
    const nameCell = worksheet.getCell(`A${startRow}`);
    nameCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD3D3D3' } };
    nameCell.font = { bold: true, name: 'Arial', size: 11, color: { argb: 'FF212121' } };
    nameCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    nameCell.border = {
      top: { style: 'thin', color: { argb: 'FF212121' } },
      left: { style: 'thin', color: { argb: 'FF212121' } },
      bottom: { style: 'thin', color: { argb: 'FF212121' } },
      right: { style: 'thin', color: { argb: 'FF212121' } },
    };

    for (let r = startRow; r <= startRow + 2; r++) {
      const row = worksheet.getRow(r);
      row.eachCell((cell, colNum) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF212121' } },
          left: { style: 'thin', color: { argb: 'FF212121' } },
          bottom: { style: 'thin', color: { argb: 'FF212121' } },
          right: { style: 'thin', color: { argb: 'FF212121' } },
        };
        cell.font = { name: 'Arial', size: 11, color: { argb: 'FF212121' }, bold: colNum === 1 || r === startRow + 1 };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      });
    }

    // Separator row
    const separatorRow = worksheet.addRow(new Array(daysOfWeek.length + 2).fill(''));
    separatorRow.height = 8;
    separatorRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F4F4F' } };
    });
  });

  worksheet.columns = [{ width: 25 }, ...daysOfWeek.map(() => ({ width: 20 })), { width: 15 }];

  // Save
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  saveAs(blob, 'worker_schedule.xlsx');
};

  const downloadDashboardAsPDF = () => {
    const dashboard = document.querySelector('.dashboard-container');
  
    // Temporarily expand dashboard if needed
    const originalOverflow = dashboard.style.overflow;
    dashboard.style.overflow = 'visible';
  
    html2canvas(dashboard, {
      scale: 2, // Higher quality
      useCORS: true,
      scrollY: -window.scrollY, // Fix position shift
    }).then((canvas) => {
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('portrait', 'mm', 'a4');
  
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
  
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
  
      const pageHeightInPx = (canvas.width * pageHeight) / pageWidth;
      let remainingHeight = canvas.height;
      let position = 0;
  
      let pageCount = 0;
  
      while (remainingHeight > 0) {
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvas.width;
        pageCanvas.height = Math.min(pageHeightInPx, remainingHeight);
  
        const ctx = pageCanvas.getContext('2d');
        ctx.drawImage(
          canvas,
          0,
          position,
          canvas.width,
          pageCanvas.height,
          0,
          0,
          canvas.width,
          pageCanvas.height
        );
  
        const pageImgData = pageCanvas.toDataURL('image/png');
        if (pageCount > 0) pdf.addPage();
        const imgHeightOnPDF = (pageCanvas.height * imgWidth) / pageCanvas.width;
        pdf.addImage(pageImgData, 'PNG', 0, 0, imgWidth, imgHeightOnPDF);
  
        position += pageCanvas.height;
        remainingHeight -= pageCanvas.height;
        pageCount++;
      }
  
      pdf.save('dashboard.pdf');
      dashboard.style.overflow = originalOverflow; // Restore styles
    });
  };
  
  const handleUnassignedChange = (index, field, value) => {
    setUnassignedStations((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };
  
  const assignUnassignedStation = async (index) => {
    const station = unassignedStations[index];
    const worker = station.assignedWorker?.trim();
  
    if (!worker) {
      alert('Please enter a valid worker name.');
      return;
    }
  
    // Check if the worker exists
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
if (sessionError || !session?.user) {
  throw new Error("User not logged in");
}

const userId = session.user.id;

// Get organization ID from profile
const { data: profile, error: profileError } = await supabase
  .from('profiles')
  .select('organization_id, user_name')
  .eq('id', userId)
  .single();

if (profileError || !profile) {
  throw new Error("Could not fetch user profile");
}

const organizationId = profile.organization_id;
const userName = profile.user_name;
// Fetch worker names from database for the org
const { data: workersData, error: workerError } = await supabase
  .from('workers')
  .select('name')
  .eq('organization_id', organizationId);

if (workerError || !workersData) {
  throw new Error("Error fetching workers from database");
}

// Validate worker existence (case-insensitive)
const workerExists = workersData.some(
  (w) => w.name.toLowerCase() === worker.toLowerCase()
);

if (!workerExists) {
  alert(`⚠️ Worker "${worker}" does not exist. Please enter a valid worker name.`);
  return;
}
// Capture current values before update
const oldAssignment = schedule[worker]?.[station.day] || {};
const oldLocation = oldAssignment.location || null;
const oldTime = oldAssignment.time || null;
  
    setSchedule((prevSchedule) => {
      const updatedSchedule = { ...prevSchedule };
  
      if (!updatedSchedule[worker]) {
        updatedSchedule[worker] = {};
      }
  
      updatedSchedule[worker][station.day] = {
        location: station.location,
        time: station.time,
        date: station.date || '',
      };
  
      return updatedSchedule;
    });
  
    setUnassignedStations((prev) => prev.filter((_, i) => i !== index));
  
    handleSave(); // Save after assigning
    const { error: auditError } = await supabase
    .from('schedule_audit')
    .insert([{
      organization_id: organizationId,
      worker_name: worker,
      day_of_week: station.day,
      old_location: oldLocation,
      new_location: station.location,
      old_time: oldTime,
      new_time: station.time,
      changed_by: userName,
      week_ending: weekEndingDate,
    }]);

  if (auditError) {
    console.error('Failed to insert audit log:', auditError.message);
  }
  };
  
  

  const handleChange = (worker, day, field, newValue) => {
    const prevValue = schedule[worker][day][field];
  
    // Ignore if no real change
    if (prevValue === newValue) return;
  
    // Use the value from onFocus as the true "original" value
    const originalValue =
      focusedFieldValue &&
      focusedFieldValue.worker === worker &&
      focusedFieldValue.day === day &&
      focusedFieldValue.field === field
        ? focusedFieldValue.value
        : prevValue;
  
    setAuditLogBuffer((prevLog) => {
      const existingIndex = prevLog.findIndex(
        (entry) =>
          entry.worker_name === worker &&
          entry.day_of_week === day &&
          entry.field === field
      );
  
      const updatedEntry = {
        worker_name: worker,
        day_of_week: day,
        field,
        old_value: originalValue,
        new_value: newValue,
      };
  
      if (existingIndex !== -1) {
        const newLog = [...prevLog];
        newLog[existingIndex] = updatedEntry;
        return newLog;
      }
  
      return [...prevLog, updatedEntry];
    });
  
    // Apply the change
    setSchedule((prevSchedule) => {
      const updated = { ...prevSchedule };
      updated[worker][day][field] = newValue;
      return updated;
    });
  };
  
  

  const handleSave = async () => {
    try {
      const weekEndingDate = datesOfWeek['Saturday'];
      if (!weekEndingDate) {
        alert('Week ending date is missing');
        return;
      }
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session?.user) return;
  
    const userId = session.user.id;
  
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('organization_id, user_name')
      .eq('id', userId)
      .single();
  
    if (profileError || !profile) return;
  
    const organizationId = profile.organization_id;
    const userName = profile.user_name;
    // Step 1: Check if any schedule entries exist for the given weekEndingDate
    const { data: existingSchedule, error: fetchError } = await supabase
      .from('schedule_entries')
      .select('*')
      .eq('week_ending', weekEndingDate);

    if (fetchError) {
      console.error('Error fetching schedule entries:', fetchError);
      return;
    }

    // Step 2: If no records exist, insert an audit log with "Schedule Created"
    if (existingSchedule.length === 0) {
      const { data: auditData, error: auditError } = await supabase
        .from('schedule_audit')
        .insert([{
          organization_id: organizationId,  // You need to retrieve this from user session or context
          worker_name: null,
          day_of_week: null,
          old_location: null,
          old_time: null,
          new_location: null,
          new_time: null,
          changed_by: userName,  
          week_ending: weekEndingDate,
          comments: 'Schedule Created',
        }]);

      if (auditError) {
        console.error('Error inserting audit log:', auditError);
        return;
      }

      console.log('Audit log inserted successfully:', auditData);
    }
      await upsertSchedule(schedule, weekEndingDate);
      await saveAuditLog(weekEndingDate);
  
      setSuccessMessage('Schedule saved successfully!');
      setAuditLogBuffer([]); // Clear the buffer
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      console.error(err);
      alert('Failed to save schedule: ' + err.message);
    }
  };
  const saveAuditLog = async (weekEndingDate) => {
    if (auditLogBuffer.length === 0) return;
  
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session?.user) return;
  
    const userId = session.user.id;
  
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('organization_id, user_name')
      .eq('id', userId)
      .single();
  
    if (profileError || !profile) return;
  
    const organizationId = profile.organization_id;
    const userName = profile.user_name;
  
    const changesToInsert = auditLogBuffer.map((entry) => {
      const isLocation = entry.field === 'location';
      return {
        organization_id: organizationId,
        worker_name: entry.worker_name,
        day_of_week: entry.day_of_week,
        old_location: isLocation ? entry.old_value : null,
        new_location: isLocation ? entry.new_value : null,
        old_time: !isLocation ? entry.old_value : null,
        new_time: !isLocation ? entry.new_value : null,
        changed_by: userName,
        week_ending: weekEndingDate,
      };
    });
  
    const { error: insertError } = await supabase
      .from('schedule_audit')
      .insert(changesToInsert);
  
    if (insertError) {
      console.error('Audit log insert failed:', insertError.message);
    }
  };
    
  const fetchAuditTrail = async () => {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session?.user) return;
  
    const userId = session.user.id;
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', userId)
      .single();
  
    if (profileError || !profile) return;
  
    const organizationId = profile.organization_id;
    const weekEnding = datesOfWeek['Saturday'];
  
    const { data, error: fetchError } = await supabase
      .from('schedule_audit')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('week_ending', weekEnding)
      .order('changed_at', { ascending: false });
  
    if (!fetchError) {
      setAuditEntries(data);
      setShowAuditModal(true);
    }
  };
  

  const getStationColor = (stationName) => {
    return stationColors[stationName] || '#f1f1f1';
  };

  // New function to generate a new schedule on button click
  const generateNewSchedule = async () => {
    const allocatedSchedule = await allocateWorkers();
    const formattedSchedule = await formatSchedule(allocatedSchedule);
    setSchedule(formattedSchedule); // Set new schedule
    assignStationColors(formattedSchedule); // Assign new station colors
    setIsNewScheduleGenerated(true); // Track that a new schedule has been generated

// NEW: Filter unassigned stations and set them
const unassigned = allocatedSchedule.filter(
  (station) => station.allocatedTo === 'Unassigned'
);
setUnassignedStations(unassigned);
  };


  const upsertSchedule = async (schedule, weekEndingDate) => {
  
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  
  
    if (sessionError || !session?.user) {
      throw new Error("User not logged in");
    }
  
    const userId = session.user.id;
  
    // Get organization_id from user's profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', userId)
      .single();
  
  
    if (profileError || !profile) {
      throw new Error("Could not fetch user profile or organization");
    }
  
    const organizationId = profile.organization_id;
  
    // Flatten schedule
    const entries = [];
  
    Object.entries(schedule).forEach(([worker, days]) => {
      Object.entries(days).forEach(([day, entry]) => {
        const entryObject = {
          organization_id: organizationId,
          worker_name: worker,
          day_of_week: day,
          location: entry.location || 'Unassigned',
          time: entry.time || '',
          date: entry.date || null,
          week_ending: weekEndingDate,
        };
        entries.push(entryObject);
      });
    });
  
  
    // Upsert into schedule_entries table
    const { error: upsertError } = await supabase
      .from('schedule_entries')
      .upsert(entries, {
        onConflict: 'organization_id,worker_name,day_of_week,week_ending',
      });
  
  
    if (upsertError) {
      throw new Error('Upsert failed: ' + upsertError.message);
    }
  
  
    return true;
  };
  

  const fetchSchedule = async (weekEndingDate) => {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  
  
    if (sessionError || !session?.user) {
      throw new Error("User not logged in");
    }
  
    const userId = session.user.id;
  
    // Get user's organization ID
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', userId)
      .single();
  
    if (profileError || !profile) {
      console.error('Error fetching profile:', profileError);
      return null;
    }
  
    const organizationId = profile.organization_id;
  
    // Fetch schedule rows
    const { data: rows, error: fetchError } = await supabase
      .from('schedule_entries')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('week_ending', weekEndingDate);
  
    if (fetchError) {
      console.error('Error fetching schedule:', fetchError);
      return null;
    }
  
    // Convert flat rows back to nested structure
    const schedule = {};
    const datesOfWeek = {};
  
    for (const row of rows) {
      const { worker_name, day_of_week, location, time, date } = row;
  
      if (!schedule[worker_name]) {
        schedule[worker_name] = {};
      }
  
      schedule[worker_name][day_of_week] = {
        location,
        time,
        date,
      };
  
      if (!datesOfWeek[day_of_week]) {
        datesOfWeek[day_of_week] = date;
      }
    }
    const weekEndingDated = new Date(weekEndingDate);

    if (!(weekEndingDated instanceof Date) || isNaN(weekEndingDated)) {
        throw new Error('Invalid date string passed to getWeekDates');
    }
    // Fill map from Sunday to Saturday
    for (let i = 0; i < 7; i++) {
        const date = new Date(weekEndingDated);
        console.log(date);
        date.setDate(weekEndingDated.getDate() - (6 - i));
        console.log(date);
        const formattedDate = date.toISOString().split('T')[0];
        datesOfWeek[daysOfWeek[i]] = formattedDate;
        console.log(datesOfWeek[daysOfWeek[i]]);
    }
    // Fill in unassigned days for each worker
    Object.keys(schedule).forEach((worker) => {
      daysOfWeek.forEach((day) => {
        if (!schedule[worker][day]) {
          schedule[worker][day] = {
            location: 'Unassigned',
            time: '',
          };
        }
      });
    });
  
    return { schedule, datesOfWeek };
  };

  const deleteSchedule = async (weekEndingDate) => {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  
    if (sessionError || !session?.user) {
      throw new Error("User not logged in");
    }
  
    const userId = session.user.id;
  
    // Get user's organization ID
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('organization_id, user_name')
      .eq('id', userId)
      .single();
  
    if (profileError || !profile) {
      console.error('Error fetching profile:', profileError);
      return null;
    }
  
    const organizationId = profile.organization_id;
    const userName = profile.user_name;
    // Delete schedule rows for the specific week
    const { data, error: deleteError } = await supabase
      .from('schedule_entries')
      .delete()
      .eq('organization_id', organizationId)
      .eq('week_ending', weekEndingDate);
  
    if (deleteError) {
      console.error('Error deleting schedule:', deleteError);
      return { success: false, message: 'Failed to delete schedule.' };
    }
    const auditLog = {
      organization_id: organizationId,
      worker_name: null,  // Since it's a full schedule deletion, no specific worker
      day_of_week: null,  // No specific day, it's for the whole schedule
      old_location: null,  // No old location, since the schedule is deleted
      old_time: null,  // No old time, since the schedule is deleted
      new_location: null,  // No new location, since it's a deletion
      new_time: null,  // No new time, since it's a deletion
      changed_by: userName,  // Use the user's email or username for "changed_by"
      week_ending: weekEndingDate,
      comments: 'Schedule Deleted',
    };
  
    // Insert the audit log record into the schedule_audit table
    const { data: auditData, error: auditError } = await supabase
      .from('schedule_audit')
      .insert([auditLog]);
  
    if (auditError) {
      console.error('Error inserting audit log:', auditError);
      return { success: false, message: 'Failed to log audit data.' };
    }
  
    // Return a success message
    return { success: true, message: 'Schedule deleted successfully.' };
  };
  
  const handleDragEnd = async (event) => {
  console.log('Drag end event:', event);
  const { active, over } = event;

  if (!over || active.id === over.id) {
    console.log('No valid drop:', { active, over });
    return;
  }

  
  try {
    const [sourceWorker, sourceDay] = active.id.split('-');
    const [destWorker, destDay] = over.id.split('-');
    console.log('Source:', { sourceWorker, sourceDay }, 'Destination:', { destWorker, destDay });

    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session?.user) {
      console.error('Session error:', sessionError);
      throw new Error('User not logged in');
    }

    const userId = session.user.id;
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('organization_id, user_name')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      console.error('Profile error:', profileError);
      throw new Error('Could not fetch user profile');
    }

    const organizationId = profile.organization_id;
    const userName = profile.user_name;

    setSchedule((prevSchedule) => {
      // Deep copy to ensure immutability
      const updatedSchedule = JSON.parse(JSON.stringify(prevSchedule));
      const sourceAssignment = { ...updatedSchedule[sourceWorker][sourceDay] };
      const destAssignment = { ...updatedSchedule[destWorker][destDay] };

      console.log('Before swap:', { sourceAssignment, destAssignment });

      // Swap assignments
      updatedSchedule[sourceWorker][sourceDay] = { ...destAssignment };
      updatedSchedule[destWorker][destDay] = { ...sourceAssignment };

      console.log('After swap:', updatedSchedule);

      // Log audit changes
      setAuditLogBuffer((prevLog) => {
        const newLog = [
          ...prevLog,
          {
            worker_name: sourceWorker,
            day_of_week: sourceDay,
            field: 'location',
            old_value: sourceAssignment.location,
            new_value: destAssignment.location,
          },
          {
            worker_name: sourceWorker,
            day_of_week: sourceDay,
            field: 'time',
            old_value: sourceAssignment.time,
            new_value: destAssignment.time,
          },
          {
            worker_name: destWorker,
            day_of_week: destDay,
            field: 'location',
            old_value: destAssignment.location,
            new_value: sourceAssignment.location,
          },
          {
            worker_name: destWorker,
            day_of_week: destDay,
            field: 'time',
            old_value: destAssignment.time,
            new_value: sourceAssignment.time,
          },
        ];
        console.log('Audit log buffer:', newLog);
        return newLog;
      });

      return updatedSchedule;
    });

    // Log state after setSchedule
    setTimeout(() => {
      console.log('State after setSchedule:', schedule);
    }, 0);

    console.log('Calling handleSave...');
    //await handleSave();
    console.log('Save completed');
  } catch (error) {
    console.error('Drag end error:', error);
    alert('Failed to save changes: ' + error.message);
  } finally {
  }
};


  return (
    <div className="dashboard-container">
      <h1 className="dashboard-header">Dashboard</h1>
      <p className="dashboard-description">Welcome to the Dashboard! Below is the schedule for the stations and allocated workers.</p>
      <div className='button-container'>
      <button className="excel-button" onClick={exportToExcel}>
        Export to Excel
      </button>

      <button className="pdf-button" onClick={downloadDashboardAsPDF}>
        Download Dashboard as PDF
      </button>

      <button className="save-button" onClick={handleSave}>
        Save Schedule
      </button>

      {/* New Generate Schedule Button */}
      <button className="generate-schedule-button" onClick={generateNewSchedule}>
        Generate New Schedule
      </button>
      <button onClick={fetchAuditTrail}>View Audit Trail</button>

      {showAuditModal && (
  <div className="audit-modal" onClick={() => setShowAuditModal(false)}>
    <div className="audit-modal-content" onClick={(e) => e.stopPropagation()}>
      <h3>Audit Trail</h3>
      <table>
        <thead>
          <tr>
            <th>Worker</th>
            <th>Day</th>
            <th>Old Location</th>
            <th>New Location</th>
            <th>Old Time</th>
            <th>New Time</th>
            <th>Comments</th>
            <th>Changed At</th>
            <th>Changed By</th>
          </tr>
        </thead>
        <tbody>
          {auditEntries.map((entry, idx) => (
            <tr key={idx}>
              <td>{entry.worker_name}</td>
              <td>{entry.day_of_week}</td>
              <td>{entry.old_location}</td>
              <td>{entry.new_location}</td>
              <td>{entry.old_time}</td>
              <td>{entry.new_time}</td>
              <td>{entry.comments}</td>
              <td>{new Date(new Date(entry.changed_at).getTime() + 60 * 60 * 1000).toLocaleString()}</td>
              <td>{entry.changed_by}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={() => setShowAuditModal(false)}>Close</button>
    </div>
  </div>
)}

<div className="search-container">
  {!showDelete ? (
    <button className="search-schedule-button" onClick={() => setShowDelete(true)}>
      Delete
    </button>
  ) : (
    <form
      className="search-form"
      onSubmit={async (e) => {
        e.preventDefault();

        if (!weekEndingDate) {
          alert("Please select a date first.");
          return;
        }
        const confirmed = window.confirm('Are you sure you want to delete the schedule for this week?');
        if (confirmed) {
        const result = await deleteSchedule(weekEndingDate);
        if (result?.success) {
          console.log(result.message);  // Log success message (e.g., 'Schedule deleted successfully.')
          
          // Optionally clear out the state or update UI after deletion
          setSchedule({});  
    
          alert('Schedule deleted successfully.');  // Optionally show a success message to the user
        } else {
          console.error(result?.message);  // Log the error message if deletion fails
          alert('Failed to delete the schedule. Please try again.');
        }
      }
      }}
    > 
      <button 
              className="close-button" 
              onClick={() => setShowDelete(false)} 
              aria-label="Close"
            >
              Close
            </button>
      
      <input
        type="date"
        value={weekEndingDate}
        onChange={(e) => setWeekEndingDate(e.target.value)}
        className="date-input"
      />
      <button type="submit" className="go-button">
        Delete
      </button>
    </form>
  )}
</div>
      <div className="search-container">
  {!showSearch ? (
    <button className="search-schedule-button" onClick={() => setShowSearch(true)}>
      Search
    </button>
  ) : (
    <form
      className="search-form"
      onSubmit={async (e) => {
        e.preventDefault();

        if (!weekEndingDate) {
          alert("Please select a date first.");
          return;
        }

        const result = await fetchSchedule(weekEndingDate);
        if (result) {
          console.log(result.schedule);
          setSchedule(result.schedule);
          setDatesOfWeek(result.datesOfWeek);
          assignStationColors(result.schedule);
        }
      }}
    >
      <button 
              className="close-button" 
              onClick={() => setShowSearch(false)} 
              aria-label="Close"
            >
              Close
            </button>
      <input
        type="date"
        value={weekEndingDate}
        onChange={(e) => setWeekEndingDate(e.target.value)}
        className="date-input"
      />
      <button type="submit" className="go-button">
        Go
      </button>
    </form>
  )}
</div>


      </div>
      {/* Success message notification */}
      {successMessage && (
        <div className="success-message">
          {successMessage}
        </div>
      )}
      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="dashboard-table-wrapper">
        <table className="dashboard-table">
          <thead>
            <tr>
              <th>Worker</th>
              {daysOfWeek.map((day) => (
  <th key={day}>
    {day} <br />
    {datesOfWeek[day] ?? '—'}
  </th>
))}

              <th>Hours Worked (72hr)</th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(schedule).map((worker) => (
              <tr key={worker}>
                <td>{worker}</td>
                <SortableContext
                    items={daysOfWeek.map((day) => `${worker}-${day}`)}
                    strategy={rectSortingStrategy}
                  >
                {daysOfWeek.map((day) => {
                  const daySchedule = schedule[worker][day];
                  const stationColor = getStationColor(daySchedule.location);
                  const id = `${worker}-${day}`;
                  return (
                        <SortableItem
                          key={id}
                          id={id}
                          worker={worker}
                          day={day}
                          daySchedule={daySchedule}
                          stationColor={stationColor}
                          handleChange={handleChange}
                          setFocusedFieldValue={setFocusedFieldValue}
                          calculateShiftDuration={calculateShiftDuration}
                        />
                      );
                })}
                </SortableContext>
                <td>{calculateHoursWorked(schedule[worker])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </DndContext>
      {unassignedStations.length > 0 && (
  <div className="unassigned-section">
    <h2>🛠️ Unassigned Stations</h2>
    <table className="unassigned-table">
      <thead>
        <tr>
          <th>Day</th>
          <th>Location</th>
          <th>Time</th>
          <th>Assign to Worker</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        {unassignedStations.map((station, index) => (
          <tr key={index}>
            <td>{station.day}</td>
            <td>
              <input
                type="text"
                value={station.location}
                onChange={(e) => handleUnassignedChange(index, 'location', e.target.value)}
              />
            </td>
            <td>
              <input
                type="text"
                value={station.time}
                onChange={(e) => handleUnassignedChange(index, 'time', e.target.value)}
              />
            </td>
            <td>
              <input
                type="text"
                placeholder="Worker name"
                value={station.assignedWorker || ''}
                onChange={(e) => handleUnassignedChange(index, 'assignedWorker', e.target.value)}
              />
            </td>
            <td>
              <button onClick={() => assignUnassignedStation(index)}>Assign</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)}


    </div>
  );
};

export default Dashboard;