const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: './.env' }); 

const app = express();
app.use(cors());
app.use(express.json());

// Database connection pool
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'event_pass_db',
    waitForConnections: true,
    connectionLimit: 10,
});

// ==========================================
// 0. POST Create User (Fixes the foreign key issue)
// ==========================================
app.post('/api/users', async (req, res) => {
    const { U_id, U_name, Mail, Dept, Year } = req.body;
    try {
        await pool.query(
            'INSERT INTO User (U_id, U_name, Mail, Dept, Year) VALUES (?, ?, ?, ?, ?)', 
            [U_id, U_name, Mail, Dept, Year]
        );
        res.status(201).json({ message: 'User created successfully' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'User ID already exists' });
        res.status(500).json({ error: err.message });
    }
});

// GET all users (for debugging / dropdowns)
app.get('/api/users', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM User');
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 1. GET Event Summary (Report Entity)
// ==========================================
app.get('/api/report', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT e.E_id, e.E_name, e.E_capacity, 
                   COUNT(r.R_id) as R_count,
                   (SELECT COUNT(*) FROM Check_in c WHERE c.E_id = e.E_id) as C_count
            FROM Event e
            LEFT JOIN Register r ON e.E_id = r.E_id
            GROUP BY e.E_id
        `);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 2. GET Top Event (SQL Task: limit 1)
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
        // Fallback if Report_View doesn't exist yet
        try {
            const [rows] = await pool.query(`
                SELECT E_name, COUNT(R_id) as R_count 
                FROM Event e LEFT JOIN Register r ON e.E_id = r.E_id 
                GROUP BY E_id ORDER BY R_count DESC LIMIT 1
            `);
            res.json(rows[0] || { E_name: 'No events yet', R_count: 0 });
        } catch (err2) { res.status(500).json({ error: err2.message }); }
    }
});

// ==========================================
// 3. POST Register (With Business Logic + Duplicate Catch)
// ==========================================
app.post('/api/register', async (req, res) => {
    const { U_id, E_id } = req.body;
    try {
        const [event] = await pool.query('SELECT E_capacity, E_status, E_name FROM Event WHERE E_id = ?', [E_id]);
        if (event.length === 0) return res.status(404).json({ error: 'Event not found' });
        
        const [count] = await pool.query('SELECT COUNT(*) as count FROM Register WHERE E_id = ?', [E_id]);
        
        if (event[0].E_status !== 'Open') return res.status(400).json({ error: 'Event is closed' });
        if (count[0].count >= event[0].E_capacity) return res.status(400).json({ error: 'Capacity exceeded' });

        const R_id = `REG-${Date.now()}`;
        await pool.query('INSERT INTO Register (R_id, U_id, E_id, E_name, E_capacity) VALUES (?, ?, ?, ?, ?)', 
            [R_id, U_id, E_id, event[0].E_name, event[0].E_capacity]);
            
        res.status(201).json({ message: 'Registered successfully' });
    } catch (err) { 
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'You are already registered for this event!' });
        }
        // ✅ Added FK error catch
        if (err.code === 'ER_NO_REFERENCED_ROW_2') {
            return res.status(400).json({ error: 'User ID does not exist. Please create the user first.' });
        }
        res.status(500).json({ error: err.message }); 
    }
});

// ==========================================
// 4. POST Check-in (Matches your ER Diagram)
// ==========================================
app.post('/api/checkin', async (req, res) => {
    const { R_id, E_id } = req.body;
    const today = new Date().toISOString().split('T')[0];
    try {
        const [reg] = await pool.query('SELECT * FROM Register WHERE R_id = ? AND E_id = ?', [R_id, E_id]);
        if (reg.length === 0) return res.status(400).json({ error: 'Invalid Registration ID' });

        const [existing] = await pool.query('SELECT * FROM Check_in WHERE R_id = ? AND E_date = ?', [R_id, today]);
        if (existing.length > 0) return res.status(400).json({ error: 'Already checked-in today' });

        await pool.query('INSERT INTO Check_in (R_id, E_id, E_date, C_status, C_count) VALUES (?, ?, ?, "Checked-in", 1)', 
            [R_id, E_id, today]);
        res.json({ message: 'Checked in successfully' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 5. POST Cancel Registration
// ==========================================
app.post('/api/cancel', async (req, res) => {
    const { U_id, E_id } = req.body;
    try {
        const [result] = await pool.query('DELETE FROM Register WHERE U_id = ? AND E_id = ?', [U_id, E_id]);
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Registration not found' });
        res.json({ message: 'Registration cancelled successfully' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));