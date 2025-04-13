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

  useEffect(() => {
    const saved = localStorage.getItem('workerSchedule');
    if (saved) {
      const parsed = JSON.parse(saved);
      setSchedule(parsed);
      assignStationColors(parsed);
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

    allocatedSchedule.forEach((station) => {
      if (station.allocatedTo && station.allocatedTo !== 'Unassigned') {
        const worker = station.allocatedTo;

        if (!formattedSchedule[worker]) {
          formattedSchedule[worker] = {};
        }

        formattedSchedule[worker][station.day] = {
          location: station.location,
          time: station.time,
        };
      }
    });

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
    
    html2canvas(dashboard).then((canvas) => {
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF();
      pdf.addImage(imgData, 'PNG', 10, 10, 180, 160);
      pdf.save('dashboard.pdf');
    });
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
                <th key={day}>{day}</th>
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
    </div>
  );
};

export default Dashboard;

