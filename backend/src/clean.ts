import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { connectDB, disconnectDB } from './config/db.js';
import { Staff } from './models/Staff.js';
import { User } from './models/User.js';
import { IncidentReport } from './models/IncidentReport.js';
import { SafetySession } from './models/SafetySession.js';

async function cleanDatabase() {
  console.log('🧹 Starting database cleanup...');
  await connectDB();

  // 1. Delete all Incident Reports
  const deletedIncidents = await IncidentReport.deleteMany({});
  console.log(`🗑️  Deleted ${deletedIncidents.deletedCount} incident report(s).`);

  // 2. Delete all Safety Sessions
  const deletedSessions = await SafetySession.deleteMany({});
  console.log(`🗑️  Deleted ${deletedSessions.deletedCount} safety session(s).`);

  // 3. Delete all Citizen / Guest Users
  const deletedUsers = await User.deleteMany({});
  console.log(`🗑️  Deleted ${deletedUsers.deletedCount} user/guest account(s).`);

  // 4. Clean Staff accounts: Keep only 'admin@safety.org', delete all other staff
  const deletedStaff = await Staff.deleteMany({ email: { $ne: 'admin@safety.org' } });
  console.log(`🗑️  Deleted ${deletedStaff.deletedCount} non-admin staff account(s).`);

  // 5. Ensure Super Admin account exists and is properly configured
  let admin = await Staff.findOne({ email: 'admin@safety.org' });
  if (!admin) {
    const adminPasswordHash = await bcrypt.hash('admin123', 10);
    admin = new Staff({
      name: 'Super Administrator',
      email: 'admin@safety.org',
      phone: '+234 800 000 0001',
      passwordHash: adminPasswordHash,
      role: 'super_admin',
      status: 'active',
      countryCode: 'ALL',
      assignedJurisdiction: 'Global Command',
    });
    await admin.save();
    console.log('👑 Created Super Admin account: admin@safety.org (password: admin123)');
  } else {
    console.log('👑 Retained Super Admin account: admin@safety.org');
  }

  console.log('\n✨ Database successfully cleaned! Only admin@safety.org remains.');
  await disconnectDB();
  process.exit(0);
}

cleanDatabase().catch((err) => {
  console.error('❌ Cleanup failed:', err);
  process.exit(1);
});
