import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import connectDB from '../config/db.js';
import routes from './routes/index.js';

const app  = express();
const PORT = process.env.PORT || 3000;

// ES module fix (__dirname)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// views folder
const webDir = path.join(__dirname, 'web');

// ── Middlewares ─────────────────────────────────────────────
app.use(express.json());

// (optional but useful for css/js/images)
app.use(express.static(webDir));

// ── View Engine (EJS) ───────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', webDir);

// ── Routes ─────────────────────────────────────────────────
app.use('/api', routes);

// render EJS
app.get('/map', (req, res) => {
    res.render('index'); // web/index.ejs
});

// health route
app.get('/', (req, res) => res.json({
    service: 'GPS Data Generator',
    endpoints: {
        map:             'GET  /map',
        generate:        'POST /api/generate',
        stats:           'GET  /api/stats',
        clear:           'DELETE /api/clear',
        journeySimulate: 'POST /api/journey/simulate'
    }
}));

// ── Boot ───────────────────────────────────────────────────
connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`🛰  Running: http://localhost:${PORT}`);
    });
}).catch(err => {
    console.error('DB connection failed:', err);
});