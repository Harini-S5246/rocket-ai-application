import React, { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [events, setEvents] = useState([]);
  const [topEvent, setTopEvent] = useState(null);
  const [users, setUsers] = useState([]);

  const fetchData = () => {
    fetch('http://localhost:5000/api/report').then(res => res.json()).then(setEvents).catch(console.error);
    fetch('http://localhost:5000/api/top-event').then(res => res.json()).then(setTopEvent).catch(console.error);
    fetch('http://localhost:5000/api/users').then(res => res.json()).then(setUsers).catch(() => {});
  };

  useEffect(() => { fetchData(); }, []);

  // ==========================================
  // CREATE USER (Fixed with parseInt for Year)
  // ==========================================
  const handleCreateUser = async () => {
    const U_id = prompt("Enter new User ID (e.g., STU-002):");
    if (!U_id) return;
    
    const U_name = prompt("Enter Name:");
    if (!U_name) return;
    
    const Mail = prompt("Enter Email:");
    if (!Mail) return;
    
    const Dept = prompt("Enter Department (e.g., CSE):");
    if (!Dept) return;
    
    const YearInput = prompt("Enter Year (number only, e.g., 3):");
    if (!YearInput) return;

    try {
      const res = await fetch('http://localhost:5000/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            U_id, 
            U_name, 
            Mail, 
            Dept, 
            Year: parseInt(YearInput) // ✅ Force integer
        })
      });
      const data = await res.json();
      
      if (res.ok) {
        alert("✅ User created! Now click Register.");
        fetchData();
      } else {
        alert("❌ Error: " + (data.error || "Unknown error"));
      }
    } catch (err) { 
      alert("❌ Network error: " + err.message); 
    }
  };

  // ==========================================
  // REGISTER
  // ==========================================
  const handleRegister = async (E_id) => {
    const U_id = prompt("Enter your existing User ID (e.g., STU-002):");
    if (!U_id) return;
    try {
      const res = await fetch('http://localhost:5000/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ U_id, E_id, R_id: `REG-${Date.now()}` })
      });
      const data = await res.json();
      alert(data.message || data.error);
      if (res.ok) fetchData();
    } catch (err) { alert("Failed: " + err.message); }
  };

  // ==========================================
  // CHECK-IN
  // ==========================================
  const handleCheckin = async (E_id) => {
    const R_id = prompt("Enter Registration ID (R_id) to check-in:");
    if (!R_id) return;
    try {
      const res = await fetch('http://localhost:5000/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ R_id, E_id })
      });
      const data = await res.json();
      alert(data.message || data.error);
      if (res.ok) fetchData();
    } catch (err) { alert("Failed: " + err.message); }
  };

  // ==========================================
  // CANCEL
  // ==========================================
  const handleCancel = async (E_id) => {
    const U_id = prompt("Enter User ID to cancel:");
    if (!U_id) return;
    try {
      const res = await fetch('http://localhost:5000/api/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ U_id, E_id })
      });
      const data = await res.json();
      alert(data.message || data.error);
      if (res.ok) fetchData();
    } catch (err) { alert("Failed: " + err.message); }
  };

  return (
    <div className="app-container">
      <header>
        <h1>Event Pass Management System</h1>
        <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
          <button 
            className="btn-register" 
            style={{ width: 'auto', padding: '10px 20px', backgroundColor: '#f59e0b' }} 
            onClick={handleCreateUser}
          >
            + Create New User
          </button>
        </div>
      </header>

      {topEvent && topEvent.E_name !== 'No events yet' && (
        <div className="top-event-banner" style={{ textAlign: 'center', marginBottom: '2rem', color: '#fbbf24', fontSize: '1.2rem' }}>
          🏆 Top Event: {topEvent.E_name} ({topEvent.R_count} registrations)
        </div>
      )}

      <div className="events-grid">
        {events.length === 0 ? (
          <p style={{ textAlign: 'center', width: '100%', color: '#94a3b8' }}>
            No events found. Please add an event to your MySQL database.
          </p>
        ) : (
          events.map(event => (
            <div key={event.E_id} className="event-card">
              <h2>{event.E_name}</h2>
              <div className="card-details">
                <p>Capacity: {event.E_capacity}</p>
                <p>Registered: {event.R_count}</p>
                <p>Checked-in: {event.C_count}</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '1rem' }}>
                <button className="btn-register" onClick={() => handleRegister(event.E_id)}>Register</button>
                <button className="btn-register" style={{ backgroundColor: '#10b981' }} onClick={() => handleCheckin(event.E_id)}>Check-in</button>
                <button className="btn-register" style={{ backgroundColor: '#ef4444' }} onClick={() => handleCancel(event.E_id)}>Cancel</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default App;