'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const db = require('../src/config/database');
const authService = require('../src/services/auth.service');
const recommendationService = require('../src/services/recommendation.service');
const historyService = require('../src/services/history.service');
const ExcelJS = require('exceljs');

async function runVerification() {
  console.log('====================================================');
  console.log('ESAP — FULL SYSTEM END-TO-END VERIFICATION');
  console.log('====================================================\n');

  try {
    // 1. Database Connection Check
    console.log('[1/6] Testing PostgreSQL Database Connection...');
    const dbTest = await db.query('SELECT NOW() as current_time, current_database() as db');
    console.log(`✓ Connected to PostgreSQL DB "${dbTest.rows[0].db}" at ${dbTest.rows[0].current_time}`);

    // 2. Authentication: User & Admin Logins
    console.log('\n[2/6] Testing Authentication Service...');
    const userAuth = await authService.login({ email: 'demo.user@esap.local', password: 'DemoUser@123' });
    console.log(`✓ Demo User Login successful: ${userAuth.user.name} (Role: ${userAuth.user.role}) - Token issued`);

    const adminAuth = await authService.login({ email: 'demo.admin@esap.local', password: 'DemoAdmin@123', adminPasskey: '2323' });
    console.log(`✓ Demo Admin Login successful: ${adminAuth.user.name} (Role: ${adminAuth.user.role}) - Token issued`);

    // 3. Location Decoupling & Request Creation
    console.log('\n[3/6] Testing Location Decoupling & Emergency Intake...');
    const manualLocationB = {
      latitude: 12.9352,
      longitude: 77.6245,
      locationLabel: 'Koramangala 4th Block, Bengaluru',
      locationSource: 'manual'
    };

    const newRequestData = {
      disasterCode: 'flood',
      priority: 'high',
      totalPeople: 4,
      childrenCount: 1,
      seniorCount: 1,
      womenCount: 2,
      disabledCount: 0,
      requiredFacilities: ['drinking_water', 'food', 'medical_assistance'],
      latitude: manualLocationB.latitude,
      longitude: manualLocationB.longitude,
      locationLabel: manualLocationB.locationLabel,
      locationSource: manualLocationB.locationSource,
      notes: 'Verification test request at manual location B'
    };

    const createdReq = await recommendationService.createRequestWithRecommendations(userAuth.user.id, newRequestData);
    console.log(`✓ Emergency Request #${createdReq.id} created successfully`);
    console.log(`  Priority: ${createdReq.priority}`);
    console.log(`  Location Source: ${createdReq.locationSource}`);
    console.log(`  Coordinates in DB: (${createdReq.latitude}, ${createdReq.longitude})`);
    console.log(`  Recommended Shelter: ${createdReq.recommendedShelterName || 'None'}`);

    if (createdReq.locationSource !== 'manual' || createdReq.latitude !== 12.9352 || createdReq.longitude !== 77.6245) {
      throw new Error('Location decoupling failed: database coordinates do not match manual Location B!');
    }
    console.log('✓ Location separation verified: Database strictly stores and uses Location B coordinates.');

    // 4. Admin Transactional Operations: Keep Allocation
    console.log('\n[4/6] Testing Admin "Keep Allocation" Transaction...');
    const confirmedReq = await recommendationService.confirmAllocation(
      createdReq.id,
      adminAuth.user.id,
      'Endorsed by Admin in verification test'
    );
    console.log(`✓ Request #${confirmedReq.id} allocation confirmed. Status: ${confirmedReq.status}, Confirmed: ${confirmedReq.allocationConfirmed}`);
    if (!confirmedReq.allocationConfirmed) {
      throw new Error('Keep allocation failed to set allocation_confirmed = true!');
    }

    // 5. Admin Transactional Operations: Change Shelter
    console.log('\n[5/6] Testing Admin "Change Shelter" Reassignment Transaction...');
    // Fetch viable shelters to pick an alternative
    const shelterListRes = await db.query(
      `SELECT id, name, total_capacity, current_occupancy, available_capacity 
       FROM shelters 
       WHERE is_active = TRUE AND status IN ('available', 'limited') 
       AND id != $1 
       LIMIT 1`,
      [createdReq.recommendedShelterId || 0]
    );

    if (shelterListRes.rows.length > 0) {
      const altShelter = shelterListRes.rows[0];
      const reassignedReq = await recommendationService.reassignAllocation(
        createdReq.id,
        adminAuth.user.id,
        altShelter.id,
        'Admin test shelter reassignment'
      );
      console.log(`✓ Request #${reassignedReq.id} reassigned to "${reassignedReq.recommendedShelterName}" (ID: ${altShelter.id})`);
      if (reassignedReq.recommendedShelterId !== altShelter.id) {
        throw new Error('Reassign shelter failed to update recommended_shelter_id!');
      }
    } else {
      console.log('ℹ No alternative shelter found for reassignment test (single shelter in seed).');
    }

    // 6. Audit Trail & Real XLSX Export
    console.log('\n[6/6] Testing Audit Trail & Real Excel (.xlsx) Generation...');
    const historyList = await historyService.listHistory({ limit: 10 });
    console.log(`✓ Audit history returned ${historyList.entries.length} recent audit log entries`);

    const exportEntries = await historyService.listHistoryForExport({});
    console.log(`✓ Found ${exportEntries.length} total history records for export`);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'ESAP Platform Test';
    const worksheet = workbook.addWorksheet('Allocation History');
    worksheet.columns = [
      { header: 'ID', key: 'id', width: 10 },
      { header: 'Date & Time', key: 'createdAt', width: 22 },
      { header: 'Action', key: 'action', width: 20 },
      { header: 'Request ID', key: 'requestId', width: 14 },
      { header: 'Shelter Name', key: 'shelterName', width: 32 },
      { header: 'Performed By', key: 'performedByName', width: 24 }
    ];
    exportEntries.slice(0, 10).forEach((e) => {
      worksheet.addRow({
        id: e.id,
        createdAt: String(e.createdAt || ''),
        action: e.action,
        requestId: e.requestId ?? 'N/A',
        shelterName: e.shelterName ?? 'N/A',
        performedByName: e.performedByName ?? 'System'
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    // Excel files start with ZIP PK header [0x50, 0x4B, 0x03, 0x04]
    const isZip = buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04;
    console.log(`✓ Real .xlsx workbook buffer generated (${buffer.length} bytes, valid PK ZIP signature: ${isZip})`);

    if (!isZip) {
      throw new Error('Generated workbook buffer does not have valid XLSX / PK signature!');
    }

    console.log('\n====================================================');
    console.log('ALL VERIFICATION CHECKS PASSED SUCCESSFULLY!');
    console.log('====================================================');
  } catch (err) {
    console.error('\n❌ Verification Failed:', err);
    process.exit(1);
  } finally {
    await db.pool.end();
  }
}

runVerification();
