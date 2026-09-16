const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: './.env' }); // Points to root .env

const app = express();
app.use(cors());
app.use(express.json());

// Database Connection Pool
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// ==========================================
// 1. ORGANIZER: Create Event
// ==========================================
app.post('/api/events', async (req, res) => {
    const { E_id, E_name, E_date, E_capacity, O_id } = req.body;
    try {
        await pool.query(
            'INSERT INTO Event (E_id, E_name, E_date, E_capacity, E_status, O_id) VALUES (?, ?, ?, ?, "Open", ?)',
            [E_id, E_name, E_date, E_capacity, O_id]
        );
        res.status(201).json({ message: 'Event created successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 2. STUDENT: Register for Event
// ==========================================
app.post('/api/register', async (req, res) => {
    const { U_id, E_id, R_id } = req.body; // In a real app, generate R_id (e.g., UUID)
    
    // We use a transaction to ensure capacity isn't breached during concurrent requests
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Check if Event exists and is Open
        const [events] = await connection.query('SELECT E_capacity, E_status, E_name FROM Event WHERE E_id = ?', [E_id]);
        if (events.length === 0) throw new Error('Event not found');
        const event = events[0];
        
        if (event.E_status !== 'Open') throw new Error('Event is closed');

        // 2. Duplicate Registration Check
        const [existing] = await connection.query('SELECT * FROM Register WHERE U_id = ? AND E_id = ?', [U_id, E_id]);
        if (existing.length > 0) throw new Error('Duplicate registration is not allowed');

        // 3. Capacity Check
        const [countResult] = await connection.query('SELECT COUNT(*) as count FROM Register WHERE E_id = ?', [E_id]);
        if (countResult[0].count >= event.E_capacity) {
            throw new Error('Event capacity has been exceeded');
        }

        // 4. Insert Registration (Including E_name and E_capacity per ER Diagram)
        await connection.query(
            'INSERT INTO Register (R_id, U_id, E_id, E_name, E_capacity) VALUES (?, ?, ?, ?, ?)',
            [R_id, U_id, E_id, event.E_name, event.E_capacity]
        );

        await connection.commit();
        res.status(201).json({ message: 'Registered successfully' });

    } catch (err) {
        await connection.rollback();
        res.status(400).json({ error: err.message });
    } finally {
        connection.release();
    }
});

// ==========================================
// 3. STUDENT: Cancel Registration
// ==========================================
app.post('/api/cancel', async (req, res) => {
    const { U_id, E_id } = req.body;
    try {
        // The specific logic: "A student can cancel before the event"
        // In a real scenario, you'd check the date. Here we just delete the record.
        const [result] = await pool.query('DELETE FROM Register WHERE U_id = ? AND E_id = ?', [U_id, E_id]);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Registration not found' });
        }
        res.json({ message: 'Registration cancelled successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 4. CHECK-IN: Validate and Check-in
// ==========================================
app.post('/api/checkin', async (req, res) => {
    const { R_id, E_id } = req.body;
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    try {
        // 1. Verify Registration exists
        const [reg] = await pool.query('SELECT * FROM Register WHERE R_id = ? AND E_id = ?', [R_id, E_id]);
        if (reg.length === 0) {
            return res.status(400).json({ error: 'Invalid registration for this event' });
        }

        // 2. Check if already checked in today (Prevents duplicate check-ins)
        const [existingCheckin] = await pool.query(
            'SELECT * FROM Check_in WHERE R_id = ? AND E_date = ?', 
            [R_id, today]
        );
        
        if (existingCheckin.length > 0) {
            return res.status(400).json({ error: 'Check-in only allowed once per day' });
        }

        // 3. Process Check-in
        await pool.query(
            'INSERT INTO Check_in (R_id, E_id, E_date, C_status, C_count) VALUES (?, ?, ?, "Checked-in", 1)',
            [R_id, E_id, today]
        );

        res.json({ message: 'Checked in successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 5. REPORT: Get Event Summary (The SQL Task)
// ==========================================
app.get('/api/report', async (req, res) => {
    try {
        // Fetches from the View we created earlier
        const [rows] = await pool.query(`
            SELECT E_id, E_name, E_capacity, R_count, C_count 
            FROM Report_View 
            ORDER BY R_count DESC
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 6. TOP EVENT: Specific limit 1 query
// ==========================================
app.get('/api/top-event', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT E_name, R_count 
            FROM Report_View 
            ORDER BY R_count DESC 
            LIMIT 1
        `);
        res.json(rows[0] || { E_name: 'No events yet', R_count: 0 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));