import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import allocateWorkers from '../services/scheduler';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import './Dashboard.css';

const Dashboard = () => {
  const [schedule, setSchedule] = useState({});
  const [stationColors, setStationColors] = useState({});
  const [successMessage, setSuccessMessage] = useState('');  // New state for success message
  const [isNewScheduleGenerated, setIsNewScheduleGenerated] = useState(false);  // State for tracking new schedule
  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const [datesOfWeek, setDatesOfWeek] = useState({});
  const [showSearch, setShowSearch] = useState(false);
  const [weekEndingDate, setWeekEndingDate] = useState('');
  const [unassignedStations, setUnassignedStations] = useState([]);
  const workersData = JSON.parse(localStorage.getItem('uploadedWorkers')) || []; 
  const uniqueWorkers = [...new Set(workersData.map(worker => worker.name))];

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


  const formatSchedule = (allocatedSchedule) => {
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
  
    // Step 3: Ensure all uploaded workers are included
    const workersData = JSON.parse(localStorage.getItem('uploadedWorkers')) || [];
    const workers = JSON.parse(JSON.stringify(workersData));
  
    workers.forEach((worker) => {
      const workerName = worker.name;
  
      if (!formattedSchedule[workerName]) {
        formattedSchedule[workerName] = {};
  
        daysOfWeek.forEach((day) => {
          formattedSchedule[workerName][day] = {
            location: 'Unassigned',
            time: '',
          };
        });
      }
    });
  
    return formattedSchedule;
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

    const generatedColors = generateUniqueColors(uniqueStations.size);
    const newStationColors = {};
    
    let index = 0;
    uniqueStations.forEach((station) => {
      newStationColors[station] = generatedColors[index];
      index++;
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

  const calculateHoursWorked = (workerSchedule) => {
    let totalHours = 0;

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

          const startDate = new Date(0, 0, 0, startHour, startMin);
          const endDate = new Date(0, 0, 0, endHour, endMin);
          const diff = (endDate - startDate) / (1000 * 60 * 60);

          if (!isNaN(diff)) {
            totalHours += diff;
          }
        }
      }
    });

    return totalHours.toFixed(2);
  };

  const exportToExcel = () => {
    const data = [];

    Object.keys(schedule).forEach((worker) => {
      const row = { Worker: worker };
      daysOfWeek.forEach((day) => {
        const entry = schedule[worker][day];
        row[day] = entry.location !== 'Unassigned' ? `${entry.location} (${entry.time})` : 'Unassigned';
      });
      row["Hours Worked"] = calculateHoursWorked(schedule[worker]);
      data.push(row);
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Schedule');
    XLSX.writeFile(workbook, 'worker_schedule.xlsx');
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
  
  const assignUnassignedStation = (index) => {
    const station = unassignedStations[index];
    const worker = station.assignedWorker?.trim();
  
    if (!worker) {
      alert('Please enter a valid worker name.');
      return;
    }
  
    // Check if the worker exists
    const workersData = JSON.parse(localStorage.getItem('uploadedWorkers')) || [];
    const workerExists = workersData.some((w) => w.name.toLowerCase() === worker.toLowerCase());
  
    if (!workerExists) {
      alert(`⚠️ Worker "${worker}" does not exist. Please enter a valid worker name.`);
      return;
    }
  
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
  };
  
  

  const handleChange = (worker, day, field, value) => {
    setSchedule((prevSchedule) => {
      const updatedSchedule = { ...prevSchedule };
      updatedSchedule[worker][day][field] = value;
      return updatedSchedule;
    });
  };

  const handleSave = () => {
    localStorage.setItem('workerSchedule', JSON.stringify(schedule));

    // Show the success message for 3 seconds
    setSuccessMessage('Schedule saved successfully!');
    
    setTimeout(() => {
      setSuccessMessage('');  // Hide the success message after 3 seconds
    }, 3000);
  };

  const getStationColor = (stationName) => {
    return stationColors[stationName] || '#f1f1f1';
  };

  // New function to generate a new schedule on button click
  const generateNewSchedule = () => {
    const allocatedSchedule = allocateWorkers();
    const formattedSchedule = formatSchedule(allocatedSchedule);
    setSchedule(formattedSchedule); // Set new schedule
    assignStationColors(formattedSchedule); // Assign new station colors
    setIsNewScheduleGenerated(true); // Track that a new schedule has been generated

// NEW: Filter unassigned stations and set them
const unassigned = allocatedSchedule.filter(
  (station) => station.allocatedTo === 'Unassigned'
);
setUnassignedStations(unassigned);

    const parsed = JSON.parse(JSON.stringify(formattedSchedule));
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
      <div className="search-container">
  {!showSearch ? (
    <button className="search-schedule-button" onClick={() => setShowSearch(true)}>
      Search
    </button>
  ) : (
    <div className="search-form">
      <input
        type="date"
        value={weekEndingDate}
        onChange={(e) => setWeekEndingDate(e.target.value)}
        className="date-input"
      />
      <button className="go-button">
        Go
      </button>
    </div>
  )}
</div>

      </div>
      {/* Success message notification */}
      {successMessage && (
        <div className="success-message">
          {successMessage}
        </div>
      )}

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
                {daysOfWeek.map((day) => {
                  const daySchedule = schedule[worker][day];
                  const stationColor = getStationColor(daySchedule.location);
                  return (
                    <td 
                      key={day}
                      className={daySchedule.location === 'Unassigned' ? 'unassigned' : 'scheduled'}
                      style={{ backgroundColor: stationColor }}
                    >
                      <input
                        type="text"
                        value={daySchedule.location !== 'Unassigned' ? daySchedule.location : ''}
                        onChange={(e) =>
                          handleChange(worker, day, 'location', e.target.value)
                        }
                        placeholder="Location"
                      />
                      <input
                        type="text"
                        value={daySchedule.time}
                        onChange={(e) =>
                          handleChange(worker, day, 'time', e.target.value)
                        }
                        placeholder="Time"
                      />
                    </td>
                  );
                })}
                <td>{calculateHoursWorked(schedule[worker])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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

