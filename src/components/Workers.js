import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import './Workers.css'; // Importing the CSS for styling

const LOCAL_STORAGE_KEY = 'uploadedWorkers';

const Workers = () => {
  const [workers, setWorkers] = useState([]);
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [showModal, setShowModal] = useState(false);

  // Separate state for editable text inputs
  const [availabilityInput, setAvailabilityInput] = useState('');
  const [canWorkStationsInput, setCanWorkStationsInput] = useState('');
  const [cannotWorkStationsInput, setCannotWorkStationsInput] = useState('');

  // Load saved data from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
      console.log('Loaded saved workers from localStorage:', saved);
      setWorkers(JSON.parse(saved));
    }
  }, []);

  // Sync input fields when modal opens
  useEffect(() => {
    if (selectedWorker) {
      setAvailabilityInput(selectedWorker.availability.join(', '));
      setCanWorkStationsInput(selectedWorker.canWorkStations.join(', '));
      setCannotWorkStationsInput(selectedWorker.cannotWorkStations.join(', '));
    }
  }, [selectedWorker]);

  const handleFileUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      console.log('No file selected');
      return;
    }

    console.log('Selected file:', file.name);

    const reader = new FileReader();

    reader.onload = (e) => {
      const data = new Uint8Array(e.target.result);
      console.log('Raw file data:', data);

      try {
        const workbook = XLSX.read(data, { type: 'array' });
        console.log('Workbook:', workbook);

        const sheetName = workbook.SheetNames[0];
        console.log('Sheet name:', sheetName);

        const worksheet = workbook.Sheets[sheetName];
        console.log('Worksheet:', worksheet);

        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        console.log('Parsed JSON data:', jsonData);

        const formattedData = jsonData.map((row, index) => ({
          id: index,
          name: row['Name'] || '',
          availability: row['Availability'] ? row['Availability'].split(', ') : [],
          preferredShift: row['Preferred Shift'] || '',
          canWorkStations: row['Can Work Stations'] ? row['Can Work Stations'].split(', ') : [],
          cannotWorkStations: row['Cannot Work Stations'] ? row['Cannot Work Stations'].split(', ') : [],
        }));

        console.log('Formatted worker data:', formattedData);

        setWorkers(formattedData);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(formattedData));
      } catch (err) {
        console.error('Error parsing Excel file:', err);
      }
    };

    reader.onerror = (error) => {
      console.error('Error reading file:', error);
    };

    reader.readAsArrayBuffer(file);
  };

  const handleRowDoubleClick = (worker) => {
    console.log('Row double-clicked:', worker);
    setSelectedWorker(worker);
    setShowModal(true);
  };

  const handleModalInputChange = (field, value) => {
    setSelectedWorker((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSaveModal = () => {
    const cleanedAvailability = availabilityInput
      .split(',')
      .map((day) => day.trim())
      .filter(Boolean);

    const cleanedCanWorkStations = canWorkStationsInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const cleanedCannotWorkStations = cannotWorkStationsInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const updatedWorker = {
      ...selectedWorker,
      availability: cleanedAvailability,
      canWorkStations: cleanedCanWorkStations,
      cannotWorkStations: cleanedCannotWorkStations,
    };

    const updatedWorkers = workers.map((worker) =>
      worker.id === selectedWorker.id ? updatedWorker : worker
    );

    setWorkers(updatedWorkers);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedWorkers));
    setShowModal(false);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedWorker(null);
  };

  const handleClearData = () => {
    console.log('Clearing all data');
    setWorkers([]);
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  };

  // Log workers for debugging
  console.log('Workers state:', workers);

  return (
    <div className="workers-container">
      <h1>Workers</h1>

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

      {workers.length === 0 && <p>No data loaded</p>}

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Availability</th>
            <th>Preferred Shift</th>
            <th>Can Work Stations</th>
            <th>Cannot Work Stations</th>
          </tr>
        </thead>
        <tbody>
          {workers.map((worker) => (
            <tr
              key={worker.id}
              onDoubleClick={() => handleRowDoubleClick(worker)}
              className="clickable-row"
            >
              <td>{worker.name}</td>
              <td>{worker.availability.join(', ')}</td>
              <td>{worker.preferredShift}</td>
              <td>{worker.canWorkStations.join(', ')}</td>
              <td>{worker.cannotWorkStations.join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {showModal && selectedWorker && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>Edit Worker</h2>
            <label>
              Name:
              <input
                type="text"
                value={selectedWorker.name}
                onChange={(e) => handleModalInputChange('name', e.target.value)}
              />
            </label>
            <label>
              Availability:
              <input
                type="text"
                value={availabilityInput}
                onChange={(e) => setAvailabilityInput(e.target.value)}
              />
            </label>
            <label>
              Preferred Shift:
              <input
                type="text"
                value={selectedWorker.preferredShift}
                onChange={(e) => handleModalInputChange('preferredShift', e.target.value)}
              />
            </label>
            <label>
              Can Work Stations:
              <input
                type="text"
                value={canWorkStationsInput}
                onChange={(e) => setCanWorkStationsInput(e.target.value)}
              />
            </label>
            <label>
              Cannot Work Stations:
              <input
                type="text"
                value={cannotWorkStationsInput}
                onChange={(e) => setCannotWorkStationsInput(e.target.value)}
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

export default Workers;
