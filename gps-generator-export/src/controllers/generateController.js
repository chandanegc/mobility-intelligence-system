import GpsRaw from '../models/gpsRaw.model.js';
import { generateUserProfile } from '../utils/userProfile.js';
import { generateDayChunked } from '../utils/gpsGenerator.js';
import { BATCH_SIZE } from '../constants/constants.js';

// ─── Batch Insert ─────────────────────────────────────────────────────────────

const batchInsert = async (docs) => {
    if (!docs.length) return 0;
    try {
        const result = await GpsRaw.insertMany(docs, { ordered: false, lean: true });
        return result.length;
    } catch (err) {
        // ordered:false — partial inserts still count
        if (err.insertedDocs) return err.insertedDocs.length;
        console.error('Batch insert error:', err.message);
        return 0;
    }
};

// ─── Main Controller ──────────────────────────────────────────────────────────

export const generateGpsData = async (req, res) => {
    let { users = 1, days = 1, clearExisting = false } = req.body;

    users = Math.min(parseInt(users) || 1, 50);   // cap at 50 users
    days  = Math.min(parseInt(days)  || 1, 90);   // cap at 90 days

    // Estimated record count: ~28,800 records/user/day
    const estimated = users * days * 28800;

    console.log(`\n🚀 GPS Generation started`);
    console.log(`   Users: ${users} | Days: ${days} | Estimated records: ${estimated.toLocaleString()}`);

    const startTime = Date.now();

    try {
        if (clearExisting) {
            console.log('🗑  Clearing existing gps_raw...');
            await GpsRaw.deleteMany({});
        }

        let totalInserted    = 0;
        let buffer           = [];  // accumulate across chunks before bulk insert
        const userStats      = [];

        // Base date: start from 'days' ago so data looks historical
        const baseDate = new Date();
        baseDate.setDate(baseDate.getDate() - days);
        baseDate.setHours(0, 0, 0, 0);

        for (let u = 0; u < users; u++) {
            const profile      = generateUserProfile(u);
            let   userInserted = 0;

            console.log(`\n👤 User ${u + 1}/${users}: ${profile.user_id} (${profile.city})`);

            for (let d = 0; d < days; d++) {
                const dayDate = new Date(baseDate);
                dayDate.setDate(baseDate.getDate() + d);

                process.stdout.write(`   Day ${d + 1}/${days} (${dayDate.toDateString()})... `);
                let dayCount = 0;

                for await (const chunk of generateDayChunked(profile, dayDate)) {
                    buffer.push(...chunk);
                    dayCount += chunk.length;

                    // Flush when buffer is big enough
                    if (buffer.length >= BATCH_SIZE) {
                        const inserted = await batchInsert(buffer.splice(0, BATCH_SIZE));
                        totalInserted  += inserted;
                        userInserted   += inserted;
                    }
                }

                process.stdout.write(`${dayCount.toLocaleString()} records\n`);
            }

            // Flush remaining buffer for this user
            while (buffer.length > 0) {
                const inserted = await batchInsert(buffer.splice(0, BATCH_SIZE));
                totalInserted  += inserted;
                userInserted   += inserted;
            }

            userStats.push({ user_id: profile.user_id, city: profile.city, records: userInserted });
            console.log(`   ✓ ${profile.user_id}: ${userInserted.toLocaleString()} records inserted`);
        }

        // Flush any leftover
        if (buffer.length > 0) {
            const inserted = await batchInsert(buffer);
            totalInserted += inserted;
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        const rps     = Math.round(totalInserted / parseFloat(elapsed));

        console.log(`\n✅ Done in ${elapsed}s — ${totalInserted.toLocaleString()} records (${rps.toLocaleString()} rec/s)\n`);

        return res.status(200).json({
            success:              true,
            message:              'GPS data generation completed',
            totalInserted,
            estimatedRecords:     estimated,
            users,
            days,
            executionTimeSeconds: parseFloat(elapsed),
            recordsPerSecond:     rps,
            userBreakdown:        userStats
        });

    } catch (err) {
        console.error('Generation error:', err);
        return res.status(500).json({
            success: false,
            message: 'GPS data generation failed',
            error:   err.message
        });
    }
};

// ─── Stats Controller ─────────────────────────────────────────────────────────

export const getGenerationStats = async (req, res) => {
    try {
        const [total, byUser, byActivity, byTimeOfDay] = await Promise.all([
            GpsRaw.countDocuments(),
            GpsRaw.aggregate([
                { $group: { _id: '$user_id', count: { $sum: 1 } } },
                { $sort:  { count: -1 } }
            ]),
            GpsRaw.aggregate([
                { $group: { _id: '$activity_type', count: { $sum: 1 } } },
                { $sort:  { count: -1 } }
            ]),
            GpsRaw.aggregate([
                { $group: { _id: '$time_of_day', count: { $sum: 1 } } },
                { $sort:  { count: -1 } }
            ])
        ]);

        return res.status(200).json({
            success: true,
            totalRecords: total,
            byUser,
            byActivity,
            byTimeOfDay
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─── Clear Controller ─────────────────────────────────────────────────────────

export const clearGpsData = async (req, res) => {
    try {
        const result = await GpsRaw.deleteMany({});
        return res.status(200).json({ success: true, deleted: result.deletedCount });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
};
