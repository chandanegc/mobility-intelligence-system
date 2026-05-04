import 'dotenv/config';
import express from 'express';
import connectDB from '../config/db.js';
import routes from './routes/index.js';

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api', routes);

app.get('/', (req, res) => res.json({
    service: 'GPS Data Generator',
    endpoints: {
        generate:        'POST /api/generate         { users, days, clearExisting }',
        stats:           'GET  /api/stats',
        clear:           'DELETE /api/clear',
        journeySimulate: 'POST /api/journey/simulate { current, last }'
    }
}));

// ── Boot ──────────────────────────────────────────────────────────────────────
connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`\n🛰  GPS Generator running on http://localhost:${PORT}`);
        console.log(`   POST /api/generate  →  start data generation`);
        console.log(`   GET  /api/stats     →  view record counts\n`);
    });
});
