import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import './Stations.css';  // Importing the CSS file for styling

const excelDateToJS = (excelSerial) => {
  const date = new Date(Math.round((excelSerial - 25569) * 86400 * 1000));
  return date.toISOString().split('T')[0];
};

const LOCAL_STORAGE_KEY = 'uploadedStations';

const Stations = () => {
  const [stations, setStations] = useState([]);
  const [selectedStation, setSelectedStation] = useState(null);
  const [showModal, setShowModal] = useState(false);

  // Load saved data on mount
  useEffect(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
      setStations(JSON.parse(saved));
    }
  }, []);

  const handleFileUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (e) => {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });

      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      const formattedData = jsonData.map((row, index) => {
        const normalizedRow = Object.keys(row).reduce((acc, key) => {
          acc[key.toLowerCase()] = row[key];
          return acc;
        }, {});

        return {
          id: index,
          date: typeof normalizedRow.date === 'number'
            ? excelDateToJS(normalizedRow.date)
            : normalizedRow.date || '',
          day: normalizedRow.day || '',
          location: normalizedRow.location || '',
          time: normalizedRow.time || '',
          hours: normalizedRow.hours || '',
        };
      });

      setStations(formattedData);
      // Automatically save data after upload
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(formattedData));
    };

    reader.readAsArrayBuffer(file);
  };

  // Handle row double-click (opens modal for editing)
  const handleRowDoubleClick = (station) => {
    setSelectedStation(station);
    setShowModal(true); // Open the modal immediately
  };

  // Handle input change inside the modal
  const handleModalInputChange = (field, value) => {
    setSelectedStation((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  // Save the updated station and update localStorage
  const handleSaveModal = () => {
    const updatedStations = stations.map((station) =>
      station.id === selectedStation.id ? selectedStation : station
    );
    setStations(updatedStations); // Update the state with the new stations array
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedStations)); // Save to localStorage
    setShowModal(false); // Close the modal after saving
  };

  // Cancel and close the modal without saving
  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedStation(null); // Clear selected station
  };

  // Clear data and localStorage
  const handleClearData = () => {
    setStations([]);
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  };

  return (
    <div className="stations-container">
      <h1>Stations</h1>

      <input
        type="file"
        accept=".xlsx, .xls"
        onChange={handleFileUpload}
        className="mb-4"
      />

      <button
        onClick={handleClearData}
        className="mb-4 px-4 py-2 bg-red-500 text-white rounded"
      >
        Clear Data
      </button>

      {stations.length === 0 && <p>No data loaded</p>}

      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Day</th>
            <th>Location</th>
            <th>Time</th>
            <th>Hours</th>
          </tr>
        </thead>
        <tbody>
          {stations.map((station) => (
            <tr
              key={station.id}
              onDoubleClick={() => handleRowDoubleClick(station)}
              className="clickable-row" // Add a class to indicate clickable rows
            >
              <td>{station.date}</td>
              <td>{station.day}</td>
              <td>{station.location}</td>
              <td>{station.time}</td>
              <td>{station.hours}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Modal for Editing */}
      {showModal && selectedStation && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>Edit Station</h2>
            <label>
              Date:
              <input
                type="text"
                value={selectedStation.date}
                onChange={(e) => handleModalInputChange('date', e.target.value)}
              />
            </label>
            <label>
              Day:
              <input
                type="text"
                value={selectedStation.day}
                onChange={(e) => handleModalInputChange('day', e.target.value)}
              />
            </label>
            <label>
              Location:
              <input
                type="text"
                value={selectedStation.location}
                onChange={(e) => handleModalInputChange('location', e.target.value)}
              />
            </label>
            <label>
              Time:
              <input
                type="text"
                value={selectedStation.time}
                onChange={(e) => handleModalInputChange('time', e.target.value)}
              />
            </label>
            <label>
              Hours:
              <input
                type="text"
                value={selectedStation.hours}
                onChange={(e) => handleModalInputChange('hours', e.target.value)}
              />
            </label>
            <div>
              <button onClick={handleSaveModal}>Save</button>
              <button onClick={handleCloseModal}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Stations;
