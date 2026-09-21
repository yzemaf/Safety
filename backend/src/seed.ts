import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { connectDB, disconnectDB } from './config/db.js';
import { Staff } from './models/Staff.js';
import { IncidentReport } from './models/IncidentReport.js';
import { User } from './models/User.js';

async function seed() {
  console.log('🌱 Starting Safety Database Seeder...');
  await connectDB();

  // 1. Seed Super Admin Account
  const adminHash = await bcrypt.hash('admin123', 10);

  const initialStaff = [
    {
      name: 'Super Administrator',
      email: 'admin@safety.org',
      phone: '+1 800 555 0199',
      passwordHash: adminHash,
      role: 'super_admin',
      status: 'active',
      countryCode: 'ALL',
      assignedJurisdiction: 'Global Command',
    },
  ];

  for (const staffData of initialStaff) {
    await Staff.findOneAndUpdate({ email: staffData.email }, { $set: staffData }, { upsert: true });
  }
  console.log(`✅ Verified Super Admin account.`);

  // 3. Seed Sample Incidents
  const sampleIncidents = [
    {
      reporterName: 'Anonymous Citizen',
      isAnonymous: true,
      category: 'physical_threat',
      urgency: 'high',
      title: 'Aggressive Suspicious Group',
      description: 'Three individuals approaching pedestrians near the transit terminal aggressively asking for money.',
      location: {
        type: 'Point',
        coordinates: [-73.9851, 40.7484], // Midtown
      },
      addressName: '5th Ave & 34th St, Midtown',
      countryCode: 'US',
      stateCode: 'NY',
      communityId: 'midtown-manhattan',
      status: 'open',
      staffComments: [
        {
          staffName: 'Control Room Dispatcher 1',
          staffRole: 'Dispatch Officer',
          comment: 'Dispatched patrol unit 4 to inspect 5th Ave junction.',
          createdAt: new Date(),
        },
      ],
    },
    {
      reporterName: 'David K.',
      isAnonymous: false,
      category: 'hazard',
      urgency: 'medium',
      title: 'Broken Streetlights & Deep Pothole',
      description: 'Streetlights completely dark for over 300 meters, creates hazardous blind spot.',
      location: {
        type: 'Point',
        coordinates: [-0.1278, 51.5074], // Westminster
      },
      addressName: 'Victoria Embankment, Westminster',
      countryCode: 'GB',
      stateCode: 'ENG',
      communityId: 'westminster',
      status: 'investigating',
      staffComments: [],
    },
    {
      reporterName: 'Anonymous',
      isAnonymous: true,
      category: 'theft',
      urgency: 'medium',
      title: 'Phone snatching incident',
      description: 'Motorcycle passenger snatched a phone from pedestrian walking near transit stop.',
      location: {
        type: 'Point',
        coordinates: [-122.4194, 37.7749], // San Francisco
      },
      addressName: 'Market St & 4th St, Downtown',
      countryCode: 'US',
      stateCode: 'CA',
      communityId: 'downtown-sf',
      status: 'open',
      staffComments: [],
    },
  ];

  for (const inc of sampleIncidents) {
    const existing = await IncidentReport.findOne({ title: inc.title });
    if (!existing) {
      const report = new IncidentReport(inc);
      await report.save();
    }
  }
  console.log(`✅ Seeded sample incidents.`);

  console.log('🎉 Seeding completed successfully!');
  await disconnectDB();
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seeder failed:', err);
  process.exit(1);
});
