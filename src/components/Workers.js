import React, { useState, useEffect } from 'react';
import './Workers.css';
import supabase from '../supabaseClient';

const Workers = () => {
  const [workers, setWorkers] = useState([]);
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [workerToDelete, setWorkerToDelete] = useState(null);
  const [organizationId, setOrganizationId] = useState(null);

  // Fetch organization_id of logged-in user
  useEffect(() => {
    const fetchOrganizationId = async () => {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session?.user) {
        console.error("User not logged in");
        return;
      }

      const userId = session.user.id;
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', userId)
        .single();

      if (profileError || !profile) {
        console.error("Could not fetch user profile or organization");
        return;
      }

      setOrganizationId(profile.organization_id);
    };

    fetchOrganizationId();
  }, []);

  // Fetch workers for this organization
  useEffect(() => {
    const fetchWorkers = async () => {
      if (!organizationId) return;

      const { data, error } = await supabase
        .from('workers')
        .select('*')
        .eq('organization_id', organizationId);

      if (error) {
        console.error('Error fetching workers:', error);
      } else {
        setWorkers(data);
      }
    };

    fetchWorkers();
  }, [organizationId]);

  const handleRowDoubleClick = (worker) => {
    setSelectedWorker(worker);
    setShowModal(true);
  };

  const handleModalInputChange = (field, value) => {
    setSelectedWorker((prev) => ({
      ...prev,
      [field]: field === 'canworkstations'
        ? value.split(',').map((s) => s.trim())
        : value,
    }));
  };

  const handleSaveModal = async () => {
    if (selectedWorker.id) {
      // Update worker
      const { data, error } = await supabase
        .from('workers')
        .update({
          name: selectedWorker.name,
          canworkstations: selectedWorker.canworkstations,
          monday: selectedWorker.monday,
          tuesday: selectedWorker.tuesday,
          wednesday: selectedWorker.wednesday,
          thursday: selectedWorker.thursday,
          friday: selectedWorker.friday,
          saturday: selectedWorker.saturday,
          sunday: selectedWorker.sunday,
        })
        .eq('id', selectedWorker.id)
        .select();

      if (error) {
        console.error('Error updating worker:', error);
      } else {
        setWorkers((prevWorkers) =>
          prevWorkers.map((worker) =>
            worker.id === selectedWorker.id ? data[0] : worker
          )
        );
      }
    } else {
      // Insert new worker
      const { data, error } = await supabase
        .from('workers')
        .insert([{ ...selectedWorker, organization_id: organizationId }])
        .select();

      if (error) {
        console.error('Error saving new worker:', error);
      } else {
        setWorkers((prevWorkers) => [...prevWorkers, data[0]]);
      }
    }

    setShowModal(false);
    setSelectedWorker(null);
  };

  const handleDeleteWorker = async () => {
    const { error } = await supabase
      .from('workers')
      .delete()
      .eq('id', workerToDelete.id);

    if (error) {
      console.error('Error deleting worker:', error);
    } else {
      setWorkers((prev) => prev.filter((w) => w.id !== workerToDelete.id));
      setShowDeleteConfirm(false);
      setWorkerToDelete(null);
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedWorker(null);
  };

  const handleAddWorker = () => {
    setSelectedWorker({
      name: '',
      canworkstations: [],
      monday: '',
      tuesday: '',
      wednesday: '',
      thursday: '',
      friday: '',
      saturday: '',
      sunday: '',
    });
    setShowModal(true);
  };

  const handleOpenDeleteConfirm = (worker) => {
    setWorkerToDelete(worker);
    setShowDeleteConfirm(true);
  };

  const handleCloseDeleteConfirm = () => {
    setShowDeleteConfirm(false);
    setWorkerToDelete(null);
  };

  return (
    <div className="workers-container">
      <h1>Workers</h1>

      <button
        onClick={handleAddWorker}
        className="mb-4 px-4 py-2 bg-green-500 text-white rounded"
      >
        Add New Worker
      </button>

      {workers.length === 0 && <p>No data loaded</p>}

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Monday</th>
            <th>Tuesday</th>
            <th>Wednesday</th>
            <th>Thursday</th>
            <th>Friday</th>
            <th>Saturday</th>
            <th>Sunday</th>
            <th>Can Work Stations</th>
            <th>Actions</th>
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
              <td>{worker.monday}</td>
              <td>{worker.tuesday}</td>
              <td>{worker.wednesday}</td>
              <td>{worker.thursday}</td>
              <td>{worker.friday}</td>
              <td>{worker.saturday}</td>
              <td>{worker.sunday}</td>
              <td>{worker.canworkstations?.join(', ')}</td>
              <td>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenDeleteConfirm(worker);
                  }}
                  className="bg-red-500 text-white px-2 py-1 rounded"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>Are you sure you want to delete this worker?</h2>
            <p>{workerToDelete?.name}</p>
            <div className="modal-buttons">
              <button
                onClick={handleDeleteWorker}
                className="bg-red-500 text-white px-4 py-2 rounded"
              >
                Yes, Delete
              </button>
              <button
                onClick={handleCloseDeleteConfirm}
                className="bg-gray-500 text-white px-4 py-2 rounded"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit/Add Modal */}
      {showModal && selectedWorker && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>{selectedWorker.id ? 'Edit Worker' : 'Add New Worker'}</h2>
            <label>
              Name:
              <input
                type="text"
                value={selectedWorker.name}
                onChange={(e) => handleModalInputChange('name', e.target.value)}
              />
            </label>
            {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => (
              <label key={day}>
                {day.charAt(0).toUpperCase() + day.slice(1)}:
                <input
                  type="text"
                  value={selectedWorker[day] || ''}
                  onChange={(e) => handleModalInputChange(day, e.target.value)}
                />
              </label>
            ))}
            <label>
              Can Work Stations:
              <input
                type="text"
                value={selectedWorker.canworkstations.join(', ')}
                onChange={(e) => handleModalInputChange('canworkstations', e.target.value)}
              />
            </label>
            <div className="modal-buttons">
              <button onClick={handleSaveModal} className="bg-blue-500 text-white px-4 py-2 rounded">Save</button>
              <button onClick={handleCloseModal} className="bg-gray-500 text-white px-4 py-2 rounded">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Workers;
