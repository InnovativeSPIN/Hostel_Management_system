const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { client, resetDatabase, cleanup, USERS, db } = require('../../helpers');

describe('API: Hostels, Rooms & Bed Management', () => {
  let c;

  before(async () => {
    await resetDatabase();
  });

  after(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    c = client();
    await c.login(USERS.admin[0], USERS.admin[1]);
    await c.login(USERS.warden[0], USERS.warden[1]);
  });

  describe('Hostel Management Endpoints', () => {
    it('GET /api/hostels returns list of active hostels with room/bed statistics', async () => {
      const res = await c.as(USERS.admin[0]).get('/api/hostels');
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.data), 'Data must be an array of hostels');
      assert.ok(res.body.data.length >= 3, 'Must have at least 3 seeded hostels');

      const hostelA = res.body.data.find((h) => h.code === 'A');
      assert.ok(hostelA, 'Must find hostel with code A');
      assert.ok('total_rooms' in hostelA, 'Stats must include total_rooms');
      assert.ok('total_beds' in hostelA, 'Stats must include total_beds');
      assert.ok('occupied_beds' in hostelA, 'Stats must include occupied_beds');
    });

    it('GET /api/hostels/:id returns detailed hostel breakdown including floors and staff', async () => {
      const hostelA = await db.one("SELECT id FROM hostels WHERE code = 'A'");
      assert.ok(hostelA, 'Hostel A must exist');
      const res = await c.as(USERS.admin[0]).get(`/api/hostels/${hostelA.id}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.data.code, 'A');
      assert.ok(Array.isArray(res.body.data.floors), 'Must return floor list');
      assert.ok(res.body.data.floors.length > 0, 'Hostel A must have floors');
    });

    it('POST /api/hostels creates a new hostel with validated uppercase code', async () => {
      const payload = {
        code: 'TH1',
        name: 'Test Tower Hostel',
        gender: 'male',
        hostelType: 'UG',
        address: 'Campus West Wing',
        status: 'active',
      };
      const res = await c.as(USERS.admin[0]).post('/api/hostels', payload);
      assert.equal(res.status, 201);
      assert.ok(res.body.data.id, 'Must return created hostel ID');

      const record = await db.one('SELECT * FROM hostels WHERE id = ?', [res.body.data.id]);
      assert.equal(record.code, 'TH1');
      assert.equal(record.name, 'Test Tower Hostel');
    });

    it('POST /api/hostels rejects duplicate hostel code with 409 conflict', async () => {
      const res = await c.as(USERS.admin[0]).post('/api/hostels', {
        code: 'A', // already exists in seed data
        name: 'Duplicate Boys Hostel',
        gender: 'male',
      });
      assert.equal(res.status, 409);
    });
  });

  describe('Room and Automatic Bed Allocation Management', () => {
    it('POST /api/rooms creates room and automatically provisions bed records', async () => {
      const hostelA = await db.one("SELECT id FROM hostels WHERE code = 'A'");
      const floor = await db.one('SELECT id FROM floors WHERE hostel_id = ? AND floor_number = 1', [hostelA.id]);

      const payload = {
        hostelId: hostelA.id,
        floorId: floor.id,
        roomNumber: 'R-999',
        roomType: 'triple',
        capacity: 3,
        isAc: true,
        attachedBath: true,
      };

      const res = await c.as(USERS.admin[0]).post('/api/rooms', payload);
      assert.equal(res.status, 201);
      const roomId = res.body.data.id;

      // Verify 3 beds were automatically inserted
      const beds = await db.query('SELECT * FROM beds WHERE room_id = ? ORDER BY bed_number', [roomId]);
      assert.equal(beds.length, 3, 'Must automatically generate 3 beds');
      assert.equal(beds[0].bed_code, 'A-1-R-999-B1');
      assert.equal(beds[0].status, 'available');
    });

    it('POST /api/rooms rejects single room type with capacity other than 1', async () => {
      const hostelA = await db.one("SELECT id FROM hostels WHERE code = 'A'");
      const floor = await db.one('SELECT id FROM floors WHERE hostel_id = ? LIMIT 1', [hostelA.id]);

      const res = await c.as(USERS.admin[0]).post('/api/rooms', {
        hostelId: hostelA.id,
        floorId: floor.id,
        roomNumber: 'R-998',
        roomType: 'single',
        capacity: 2, // invalid for single room
      });
      assert.equal(res.status, 400);
      assert.equal(res.body.code, 'INVALID_CAPACITY');
    });

    it('PUT /api/rooms/:id prevents shrinking room capacity below current active occupancy', async () => {
      const occupiedRoom = await db.one('SELECT id, capacity, current_occupancy FROM rooms WHERE current_occupancy > 0 LIMIT 1');
      assert.ok(occupiedRoom, 'Must find occupied room');

      const res = await c.as(USERS.admin[0]).put(`/api/rooms/${occupiedRoom.id}`, {
        roomType: 'single',
        capacity: 0,
        isAc: false,
        attachedBath: false,
      });
      assert.equal(res.status, 400);
    });
  });

  describe('Live Bed Availability Map & Queries', () => {
    it('GET /api/beds/available returns only beds with status available in active rooms', async () => {
      const res = await c.as(USERS.warden[0]).get('/api/beds/available?gender=male');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.data));
      assert.ok(res.body.data.every((b) => b.gender === 'male' || b.gender === 'co-ed'));
    });

    it('GET /api/beds/map provides the hierarchical live occupancy map', async () => {
      const res = await c.as(USERS.warden[0]).get('/api/beds/map');
      assert.equal(res.status, 200);
      assert.ok(res.body.data.summary, 'Must contain summary statistics');
      assert.ok(res.body.data.summary.total > 0, 'Must have total beds count');
      assert.ok(Array.isArray(res.body.data.hostels), 'Must contain hostels array');
      assert.ok(res.body.data.hostels.length > 0, 'Must return at least 1 hostel in map');
      const first = res.body.data.hostels[0];
      assert.ok('code' in first);
      assert.ok(Array.isArray(first.floors));
    });
  });
});
