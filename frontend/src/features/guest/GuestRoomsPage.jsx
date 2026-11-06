import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  Hotel,
  Plus,
  Search,
  Users,
  CheckCircle2,
  Clock,
  ShieldCheck,
  DoorOpen,
  LogOut,
  Phone,
  User,
  Wrench,
  RefreshCw,
  Sparkles,
  Info,
  Calendar,
  Building,
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import DataTable, { Pagination } from '../../components/ui/DataTable';
import { Badge } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { Modal, ConfirmDialog } from '../../components/ui/Modal';
import { Input, Select, Textarea } from '../../components/ui/Field';
import { Tabs, SearchInput, FilterSelect, FilterBar } from '../../components/ui/Misc';
import StudentPicker from '../../components/StudentPicker';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { fmtDateTime } from '../../utils/format';

const ID_PROOF_TYPES = [
  { value: 'aadhaar', label: 'Aadhaar Card' },
  { value: 'driving_license', label: 'Driving Licence' },
  { value: 'voter_id', label: 'Voter ID' },
  { value: 'passport', label: 'Passport' },
  { value: 'pan', label: 'PAN Card' },
  { value: 'other', label: 'Other Photo ID' },
];

const ROOM_TYPES = [
  { value: 'single', label: 'Single Room' },
  { value: 'double', label: 'Double Room' },
  { value: 'suite', label: 'Executive Suite' },
  { value: 'dormitory', label: 'Dormitory' },
];

export default function GuestRoomsPage() {
  const { can } = useAuth();
  const manage = can('hostels.manage') || can('allocations.manage');

  const [tab, setTab] = useState('rooms');
  const [report, setReport] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [loadingRooms, setLoadingRooms] = useState(true);

  // Room filters
  const [roomStatus, setRoomStatus] = useState('');
  const [roomAc, setRoomAc] = useState('');
  const [roomType, setRoomType] = useState('');
  const [roomSearch, setRoomSearch] = useState('');

  // History / Allocations
  const [allocations, setAllocations] = useState([]);
  const [allocMeta, setAllocMeta] = useState({ page: 1, limit: 15, total: 0, pages: 1 });
  const [allocStatus, setAllocStatus] = useState('');
  const [allocSearch, setAllocSearch] = useState('');
  const [allocPage, setAllocPage] = useState(1);
  const [loadingAlloc, setLoadingAlloc] = useState(false);

  // Modals
  const [allocatingRoom, setAllocatingRoom] = useState(null);
  const [checkingOutAlloc, setCheckingOutAlloc] = useState(null);
  const [editingRoom, setEditingRoom] = useState(null);
  const [addingRoom, setAddingRoom] = useState(false);
  const [actionPending, setActionPending] = useState(false);

  // Load report and rooms
  const loadRoomsAndReport = useCallback(async () => {
    setLoadingRooms(true);
    try {
      const [repRes, roomsRes] = await Promise.all([
        api.get('/guest/report'),
        api.get('/guest/rooms', {
          params: {
            status: roomStatus || undefined,
            isAc: roomAc || undefined,
            roomType: roomType || undefined,
            search: roomSearch || undefined,
          },
        }),
      ]);
      setReport(repRes.data.data);
      setRooms(roomsRes.data.data || []);
    } catch (err) {
      toast.error(err.message || 'Failed to load guest rooms');
    } finally {
      setLoadingRooms(false);
    }
  }, [roomStatus, roomAc, roomType, roomSearch]);

  // Load history
  const loadAllocations = useCallback(async () => {
    setLoadingAlloc(true);
    try {
      const res = await api.get('/guest/allocations', {
        params: {
          page: allocPage,
          limit: 15,
          status: allocStatus || undefined,
          search: allocSearch || undefined,
        },
      });
      setAllocations(res.data.data || []);
      setAllocMeta(res.data.meta || { page: 1, limit: 15, total: 0, pages: 1 });
    } catch (err) {
      toast.error(err.message || 'Failed to load allocations history');
    } finally {
      setLoadingAlloc(false);
    }
  }, [allocPage, allocStatus, allocSearch]);

  useEffect(() => {
    loadRoomsAndReport();
  }, [loadRoomsAndReport]);

  useEffect(() => {
    if (tab === 'history') {
      loadAllocations();
    }
  }, [tab, loadAllocations]);

  const refreshAll = () => {
    loadRoomsAndReport();
    if (tab === 'history') loadAllocations();
  };

  // Check-out action
  const handleCheckOut = async (remarks) => {
    if (!checkingOutAlloc) return;
    setActionPending(true);
    try {
      await api.patch(`/guest/allocations/${checkingOutAlloc.id}/check-out`, { remarks });
      toast.success(`Checked out ${checkingOutAlloc.guest_name} successfully`);
      setCheckingOutAlloc(null);
      refreshAll();
    } catch (err) {
      toast.error(err.message || 'Failed to check out guest');
    } finally {
      setActionPending(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Guest Room Allocation"
        subtitle="Manage guest suites, dignitary stays, visiting faculty & family accommodation"
        breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Guest Rooms' }]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" icon={RefreshCw} onClick={refreshAll}>
              Refresh
            </Button>
            {manage && (
              <>
                <Button variant="secondary" size="sm" icon={Building} onClick={() => setAddingRoom(true)}>
                  Add Room
                </Button>
                <Button size="sm" icon={Plus} onClick={() => setAllocatingRoom({})}>
                  Allocate Room
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Zero Fee Policy Banner & KPI Cards */}
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white shadow">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-emerald-900">Zero-Fee Institutional Policy Active</h3>
              <Badge tone="success">100% Complimentary</Badge>
            </div>
            <p className="text-xs text-emerald-700">
              Guest room allocations are strictly institutional and complimentary. No ledger entries, fees, or dues are ever posted to student accounts.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800 bg-emerald-100/80 px-3 py-1.5 rounded-lg border border-emerald-200">
          <Sparkles className="h-4 w-4 text-emerald-600" />
          <span>Ledger Safe · Zero Invoicing</span>
        </div>
      </div>

      {/* KPI Metrics */}
      {report && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Guest Rooms</p>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-bold text-slate-900">{report.totalRooms}</span>
              <span className="text-xs text-slate-500">Cap: {report.totalCapacity} guests</span>
            </div>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 shadow-sm">
            <p className="text-xs font-medium text-emerald-700 uppercase tracking-wider">Available Now</p>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-bold text-emerald-700">{report.availableRooms}</span>
              <Badge tone="success">Ready</Badge>
            </div>
          </div>
          <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-4 shadow-sm">
            <p className="text-xs font-medium text-amber-800 uppercase tracking-wider">Occupied</p>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-bold text-amber-700">{report.occupiedRooms}</span>
              <span className="text-xs text-amber-800 font-medium">{report.activeGuestsCount} active guests</span>
            </div>
          </div>
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 shadow-sm">
            <p className="text-xs font-medium text-indigo-700 uppercase tracking-wider">Completed Stays</p>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-bold text-indigo-700">{report.completedStays}</span>
              <span className="text-xs text-indigo-600">All-time</span>
            </div>
          </div>
        </div>
      )}

      {/* Main Tabs */}
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'rooms', label: `Live Rooms & Availability (${rooms.length})` },
          { value: 'history', label: 'Allocation History & Report' },
        ]}
      />

      {/* Tab 1: Live Rooms */}
      {tab === 'rooms' && (
        <div className="space-y-4">
          <FilterBar>
            <SearchInput
              value={roomSearch}
              onChange={setRoomSearch}
              placeholder="Search room number, block, amenities..."
            />
            <FilterSelect
              value={roomStatus}
              onChange={setRoomStatus}
              options={[
                { value: '', label: 'All Statuses' },
                { value: 'available', label: 'Available Only' },
                { value: 'occupied', label: 'Occupied' },
                { value: 'maintenance', label: 'Maintenance / Blocked' },
              ]}
            />
            <FilterSelect
              value={roomAc}
              onChange={setRoomAc}
              options={[
                { value: '', label: 'All Air Conditioning' },
                { value: 'true', label: 'AC Only' },
                { value: 'false', label: 'Non-AC Only' },
              ]}
            />
            <FilterSelect
              value={roomType}
              onChange={setRoomType}
              options={[
                { value: '', label: 'All Room Types' },
                ...ROOM_TYPES,
              ]}
            />
          </FilterBar>

          {loadingRooms ? (
            <div className="flex h-48 items-center justify-center rounded-xl border border-slate-200 bg-white">
              <p className="text-sm text-slate-500">Loading guest rooms...</p>
            </div>
          ) : rooms.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
              <Hotel className="mx-auto h-12 w-12 text-slate-300" />
              <h3 className="mt-2 text-sm font-semibold text-slate-900">No guest rooms found</h3>
              <p className="mt-1 text-xs text-slate-500">Try adjusting your search or filters.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {rooms.map((r) => {
                const isAvail = r.status === 'available';
                const isOccupied = r.status === 'occupied';
                const isMaint = ['maintenance', 'blocked'].includes(r.status);

                return (
                  <div
                    key={r.id}
                    className={`rounded-xl border bg-white p-4 shadow-sm transition-all hover:shadow-md flex flex-col justify-between ${
                      isAvail
                        ? 'border-emerald-200 hover:border-emerald-400'
                        : isOccupied
                        ? 'border-amber-200 bg-amber-50/20 hover:border-amber-400'
                        : 'border-slate-300 bg-slate-50/50'
                    }`}
                  >
                    <div>
                      {/* Room Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-lg font-bold text-slate-900">{r.room_number}</span>
                            <Badge tone={r.is_ac ? 'info' : 'neutral'}>{r.is_ac ? 'AC' : 'Non-AC'}</Badge>
                          </div>
                          <p className="text-xs font-medium text-slate-500 mt-0.5">
                            {r.block_name} {r.hostel_name ? `· ${r.hostel_name}` : ''}
                          </p>
                        </div>
                        <Badge
                          tone={
                            isAvail ? 'success' : isOccupied ? 'warning' : 'neutral'
                          }
                        >
                          {r.status.toUpperCase()}
                        </Badge>
                      </div>

                      {/* Type & Capacity */}
                      <div className="mt-3 flex items-center gap-4 text-xs text-slate-600">
                        <span className="capitalize font-medium">{r.room_type}</span>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <Users className="h-3.5 w-3.5 text-slate-400" />
                          Cap: {r.capacity}
                        </span>
                        <span>·</span>
                        <span>Floor {r.floor_number}</span>
                      </div>

                      {/* Amenities */}
                      {r.amenities && (
                        <p className="mt-2 text-xs text-slate-500 line-clamp-2">
                          <span className="font-semibold text-slate-600">Amenities:</span> {r.amenities}
                        </p>
                      )}

                      {/* Active Guest Info if Occupied */}
                      {isOccupied && (
                        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/80 p-2.5 text-xs text-amber-900 space-y-1">
                          <div className="flex items-center justify-between font-semibold">
                            <span className="flex items-center gap-1.5 truncate">
                              <User className="h-3.5 w-3.5 text-amber-700 shrink-0" />
                              {r.current_guest_name}
                            </span>
                            <span className="text-[10px] text-amber-700 font-mono">
                              {r.current_booking_code}
                            </span>
                          </div>
                          {r.current_guest_phone && (
                            <p className="flex items-center gap-1.5 text-amber-800 text-[11px]">
                              <Phone className="h-3 w-3 text-amber-600" />
                              {r.current_guest_phone}
                            </p>
                          )}
                          <div className="flex items-center gap-1 text-[11px] text-amber-700">
                            <Clock className="h-3 w-3 text-amber-600" />
                            <span>Out: {fmtDateTime(r.current_expected_check_out)}</span>
                          </div>
                          {r.current_related_student_name && (
                            <p className="text-[11px] text-amber-800 pt-0.5 border-t border-amber-200/60">
                              Guest of: <span className="font-medium">{r.current_related_student_name}</span>
                            </p>
                          )}
                        </div>
                      )}

                      {/* Remarks if any */}
                      {r.remarks && !isOccupied && (
                        <p className="mt-2 text-[11px] text-slate-400 italic">
                          {r.remarks}
                        </p>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                      {manage && isAvail && (
                        <Button
                          size="xs"
                          icon={Plus}
                          className="w-full"
                          onClick={() => setAllocatingRoom(r)}
                        >
                          Allocate Guest
                        </Button>
                      )}

                      {manage && isOccupied && (
                        <Button
                          size="xs"
                          variant="secondary"
                          icon={LogOut}
                          className="w-full text-amber-700 hover:text-amber-800 hover:bg-amber-100"
                          onClick={() =>
                            setCheckingOutAlloc({
                              id: r.active_allocation_id,
                              booking_code: r.current_booking_code,
                              guest_name: r.current_guest_name,
                              room_number: r.room_number,
                            })
                          }
                        >
                          Check Out
                        </Button>
                      )}

                      {manage && (
                        <Button
                          size="xs"
                          variant="ghost"
                          icon={Wrench}
                          onClick={() => setEditingRoom(r)}
                          title="Edit Room / Status"
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Allocation History & Report */}
      {tab === 'history' && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
          <FilterBar>
            <SearchInput
              value={allocSearch}
              onChange={(s) => {
                setAllocSearch(s);
                setAllocPage(1);
              }}
              placeholder="Search guest name, phone, booking code, ID proof..."
            />
            <FilterSelect
              value={allocStatus}
              onChange={(st) => {
                setAllocStatus(st);
                setAllocPage(1);
              }}
              options={[
                { value: '', label: 'All Booking Statuses' },
                { value: 'active', label: 'Active (Inside Now)' },
                { value: 'checked_out', label: 'Checked Out' },
                { value: 'cancelled', label: 'Cancelled' },
              ]}
            />
          </FilterBar>

          <DataTable
            loading={loadingAlloc}
            rows={allocations}
            columns={[
              {
                header: 'Booking Code',
                cell: (row) => (
                  <div>
                    <span className="font-mono text-xs font-bold text-slate-800">{row.booking_code}</span>
                    <Badge tone="success" className="ml-1.5 text-[10px]">Zero Fee</Badge>
                  </div>
                ),
              },
              {
                header: 'Guest Name & Contact',
                cell: (row) => (
                  <div>
                    <p className="font-medium text-slate-900">{row.guest_name}</p>
                    <p className="text-xs text-slate-500">{row.phone} {row.email ? `· ${row.email}` : ''}</p>
                  </div>
                ),
              },
              {
                header: 'Room',
                cell: (row) => (
                  <div>
                    <span className="font-semibold text-slate-900">{row.room_number}</span>
                    <span className="text-xs text-slate-500 block">{row.block_name} ({row.is_ac ? 'AC' : 'Non-AC'})</span>
                  </div>
                ),
              },
              {
                header: 'ID Proof & Purpose',
                cell: (row) => (
                  <div className="text-xs">
                    <p className="font-medium text-slate-700 uppercase">
                      {row.id_proof_type?.replace('_', ' ')}: {row.id_proof_number}
                    </p>
                    <p className="text-slate-500 truncate max-w-xs">{row.purpose}</p>
                  </div>
                ),
              },
              {
                header: 'Host / Student',
                cell: (row) => (
                  <div className="text-xs">
                    {row.related_student_name ? (
                      <>
                        <p className="font-medium text-slate-800">{row.related_student_name}</p>
                        <p className="text-slate-500">{row.related_student_register_number} {row.relationship_to_student ? `(${row.relationship_to_student})` : ''}</p>
                      </>
                    ) : (
                      <span className="text-slate-400 italic">Institutional Guest</span>
                    )}
                  </div>
                ),
              },
              {
                header: 'Check-In / Out',
                cell: (row) => (
                  <div className="text-xs text-slate-600">
                    <p><span className="text-slate-400">In:</span> {fmtDateTime(row.check_in_at)}</p>
                    <p>
                      <span className="text-slate-400">Out:</span>{' '}
                      {row.actual_check_out_at
                        ? fmtDateTime(row.actual_check_out_at)
                        : `Exp: ${fmtDateTime(row.expected_check_out_at)}`}
                    </p>
                  </div>
                ),
              },
              {
                header: 'Status',
                cell: (row) => (
                  <Badge tone={row.status === 'active' ? 'warning' : row.status === 'checked_out' ? 'success' : 'neutral'}>
                    {row.status.toUpperCase()}
                  </Badge>
                ),
              },
              {
                header: 'Action',
                cell: (row) =>
                  manage && row.status === 'active' ? (
                    <Button
                      size="xs"
                      variant="secondary"
                      icon={LogOut}
                      onClick={() => setCheckingOutAlloc(row)}
                    >
                      Check Out
                    </Button>
                  ) : null,
              },
            ]}
          />

          <Pagination
            meta={allocMeta}
            onChange={(newPage) => setAllocPage(newPage)}
          />
        </div>
      )}

      {/* MODAL 1: Allocate Guest Room */}
      {allocatingRoom && (
        <AllocateGuestModal
          room={allocatingRoom.id ? allocatingRoom : null}
          availableRooms={rooms.filter((r) => r.status === 'available')}
          onClose={() => setAllocatingRoom(null)}
          onSuccess={() => {
            setAllocatingRoom(null);
            refreshAll();
          }}
        />
      )}

      {/* MODAL 2: Check-Out Confirmation */}
      {checkingOutAlloc && (
        <ConfirmDialog
          open={!!checkingOutAlloc}
          loading={actionPending}
          tone="primary"
          title={`Check Out · ${checkingOutAlloc.guest_name}`}
          message={`Confirm check-out from Room ${checkingOutAlloc.room_number || ''} (${checkingOutAlloc.booking_code || ''}). Room status will immediately be released back to 'Available'.`}
          confirmLabel="Complete Check-Out"
          reasonLabel="Optional Check-Out Notes / Remarks"
          onClose={() => setCheckingOutAlloc(null)}
          onConfirm={(remarks) => handleCheckOut(remarks)}
        />
      )}

      {/* MODAL 3: Add Room Master */}
      {addingRoom && (
        <AddRoomModal
          onClose={() => setAddingRoom(false)}
          onSuccess={() => {
            setAddingRoom(false);
            refreshAll();
          }}
        />
      )}

      {/* MODAL 4: Edit Room Master */}
      {editingRoom && (
        <EditRoomModal
          room={editingRoom}
          onClose={() => setEditingRoom(null)}
          onSuccess={() => {
            setEditingRoom(null);
            refreshAll();
          }}
        />
      )}
    </div>
  );
}

// ----------------------------------------------------
// Sub-component: Allocate Guest Room Modal
// ----------------------------------------------------
function AllocateGuestModal({ room, availableRooms, onClose, onSuccess }) {
  const [selectedRoomId, setSelectedRoomId] = useState(room?.id || (availableRooms[0]?.id || ''));
  const [guestName, setGuestName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [idProofType, setIdProofType] = useState('aadhaar');
  const [idProofNumber, setIdProofNumber] = useState('');
  const [purpose, setPurpose] = useState('');
  const [relatedStudent, setRelatedStudent] = useState(null);
  const [relationship, setRelationship] = useState('');
  const [numberOfGuests, setNumberOfGuests] = useState(1);
  const [checkInAt, setCheckInAt] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  });
  const [expectedCheckOutAt, setExpectedCheckOutAt] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  });
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedRoomId) {
      toast.error('Please select an available guest room');
      return;
    }
    if (!guestName.trim()) {
      toast.error('Please enter the guest full name');
      return;
    }
    if (!phone.trim()) {
      toast.error('Please enter contact phone');
      return;
    }
    if (!idProofNumber.trim()) {
      toast.error('Please enter ID proof number');
      return;
    }
    if (!purpose.trim()) {
      toast.error('Please enter purpose of visit');
      return;
    }
    if (!expectedCheckOutAt) {
      toast.error('Please specify expected check-out date and time');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        guestRoomId: Number(selectedRoomId),
        guestName: guestName.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        idProofType,
        idProofNumber: idProofNumber.trim(),
        purpose: purpose.trim(),
        relatedStudentId: relatedStudent?.id || undefined,
        relationshipToStudent: relationship.trim() || undefined,
        numberOfGuests: Number(numberOfGuests) || 1,
        checkInAt: checkInAt ? checkInAt.replace('T', ' ') + ':00' : undefined,
        expectedCheckOutAt: expectedCheckOutAt.replace('T', ' ') + ':00',
        remarks: remarks.trim() || undefined,
      };

      const res = await api.post('/guest/allocations', payload);
      toast.success(`Booked ${res.data.data.booking_code} for ${guestName} (Zero Fee)`);
      onSuccess();
    } catch (err) {
      toast.error(err.message || 'Failed to allocate guest room');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      size="lg"
      title="Allocate Guest Room"
      description="Register institutional guests, examiners, or visiting guardians"
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-xs text-emerald-700 font-semibold flex items-center gap-1">
            <CheckCircle2 className="h-4 w-4" />
            Zero-Fee Protected
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button loading={submitting} onClick={handleSubmit}>
              Confirm Allocation
            </Button>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Zero Fee Alert */}
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
          <p className="font-semibold flex items-center gap-1.5">
            <Info className="h-4 w-4 text-emerald-600" />
            Institutional Zero-Fee Allocation Policy
          </p>
          <p className="mt-0.5 text-emerald-700">
            Guest room accommodations are fully complimentary. No ledger entries, fees, or invoices will be posted to any student or hostel accounts.
          </p>
        </div>

        {/* Room Picker */}
        <div>
          <label className="label">
            Select Guest Room <span className="text-red-500">*</span>
          </label>
          <select
            value={selectedRoomId}
            onChange={(e) => setSelectedRoomId(e.target.value)}
            className="input"
            required
          >
            <option value="">-- Choose Available Guest Room --</option>
            {availableRooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.room_number} ({r.block_name} · {r.room_type.toUpperCase()} · {r.is_ac ? 'AC' : 'Non-AC'} · Cap: {r.capacity})
              </option>
            ))}
          </select>
        </div>

        {/* Guest Details */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Guest Full Name"
            placeholder="e.g. Dr. K. Ramanathan"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            required
          />
          <Input
            label="Phone Number"
            placeholder="e.g. 9876543210"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Email Address (Optional)"
            type="email"
            placeholder="guest@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            label="Number of Guests"
            type="number"
            min="1"
            max="10"
            value={numberOfGuests}
            onChange={(e) => setNumberOfGuests(e.target.value)}
            required
          />
        </div>

        {/* ID Proof */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select
            label="ID Proof Type"
            value={idProofType}
            onChange={(e) => setIdProofType(e.target.value)}
            options={ID_PROOF_TYPES}
            required
          />
          <Input
            label="ID Proof Number"
            placeholder="e.g. 1234 5678 9012"
            value={idProofNumber}
            onChange={(e) => setIdProofNumber(e.target.value)}
            required
          />
        </div>

        {/* Purpose */}
        <Input
          label="Purpose of Stay / Allocation"
          placeholder="e.g. Guest Lecturer for ECE / Parent Visit / Anna University Inspection"
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          required
        />

        {/* Related Student (Optional) */}
        <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 space-y-3">
          <p className="text-xs font-semibold text-slate-700">Host Student Reference (Optional)</p>
          <StudentPicker
            value={relatedStudent}
            onChange={setRelatedStudent}
            label="Visiting Student (if applicable)"
          />
          {relatedStudent && (
            <Input
              label="Relationship to Student"
              placeholder="e.g. Father, Mother, Guardian, Uncle"
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
            />
          )}
        </div>

        {/* Dates */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            type="datetime-local"
            label="Check-In Date & Time"
            value={checkInAt}
            onChange={(e) => setCheckInAt(e.target.value)}
            required
          />
          <Input
            type="datetime-local"
            label="Expected Check-Out Date & Time"
            value={expectedCheckOutAt}
            onChange={(e) => setExpectedCheckOutAt(e.target.value)}
            required
          />
        </div>

        {/* Remarks */}
        <Textarea
          label="Remarks / Special Arrangements"
          placeholder="e.g. Early breakfast requested, tea tray in room"
          rows={2}
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
        />
      </form>
    </Modal>
  );
}

// ----------------------------------------------------
// Sub-component: Add Room Master Modal
// ----------------------------------------------------
function AddRoomModal({ onClose, onSuccess }) {
  const [roomNumber, setRoomNumber] = useState('');
  const [blockName, setBlockName] = useState('Guest Wing');
  const [floorNumber, setFloorNumber] = useState(1);
  const [roomType, setRoomType] = useState('double');
  const [isAc, setIsAc] = useState(true);
  const [capacity, setCapacity] = useState(2);
  const [amenities, setAmenities] = useState('AC, Attached Bath, WiFi, Desk, TV, Electric Kettle');
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!roomNumber.trim()) {
      toast.error('Room number is required');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/guest/rooms', {
        roomNumber: roomNumber.trim().toUpperCase(),
        blockName: blockName.trim(),
        floorNumber: Number(floorNumber),
        roomType,
        isAc,
        capacity: Number(capacity),
        amenities: amenities.trim() || undefined,
        remarks: remarks.trim() || undefined,
      });
      toast.success(`Guest room ${roomNumber} created`);
      onSuccess();
    } catch (err) {
      toast.error(err.message || 'Failed to add guest room');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      size="md"
      title="Add Guest Room Master"
      description="Create a new guest suite or VIP accommodation"
      onClose={onClose}
      footer={
        <div className="flex gap-2 justify-end w-full">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={submitting} onClick={handleSubmit}>
            Create Room
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Room Number"
            placeholder="e.g. G-103"
            value={roomNumber}
            onChange={(e) => setRoomNumber(e.target.value)}
            required
          />
          <Input
            label="Block / Wing Name"
            placeholder="e.g. Admin Guest Wing"
            value={blockName}
            onChange={(e) => setBlockName(e.target.value)}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Room Type"
            value={roomType}
            onChange={(e) => setRoomType(e.target.value)}
            options={ROOM_TYPES}
          />
          <Input
            label="Floor Number"
            type="number"
            min="0"
            max="10"
            value={floorNumber}
            onChange={(e) => setFloorNumber(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Capacity (Persons)"
            type="number"
            min="1"
            max="10"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
          />
          <div className="pt-6">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={isAc}
                onChange={(e) => setIsAc(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              Air Conditioned (AC)
            </label>
          </div>
        </div>

        <Input
          label="Amenities"
          value={amenities}
          onChange={(e) => setAmenities(e.target.value)}
          placeholder="e.g. Attached Bath, TV, WiFi, Fridge"
        />

        <Textarea
          label="Remarks / Notes"
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          rows={2}
          placeholder="Special notes regarding this room"
        />
      </form>
    </Modal>
  );
}

// ----------------------------------------------------
// Sub-component: Edit Room Master Modal
// ----------------------------------------------------
function EditRoomModal({ room, onClose, onSuccess }) {
  const [status, setStatus] = useState(room.status);
  const [isAc, setIsAc] = useState(Boolean(room.is_ac));
  const [capacity, setCapacity] = useState(room.capacity);
  const [amenities, setAmenities] = useState(room.amenities || '');
  const [remarks, setRemarks] = useState(room.remarks || '');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.patch(`/guest/rooms/${room.id}`, {
        status,
        isAc,
        capacity: Number(capacity),
        amenities: amenities.trim() || undefined,
        remarks: remarks.trim() || undefined,
      });
      toast.success(`Room ${room.room_number} updated`);
      onSuccess();
    } catch (err) {
      toast.error(err.message || 'Failed to update guest room');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      size="md"
      title={`Manage Room ${room.room_number}`}
      description={`${room.block_name} · ${room.room_type.toUpperCase()}`}
      onClose={onClose}
      footer={
        <div className="flex gap-2 justify-end w-full">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={submitting} onClick={handleSubmit}>
            Save Changes
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <Select
          label="Room Status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={[
            { value: 'available', label: 'Available (Ready for allocation)' },
            { value: 'maintenance', label: 'Maintenance (Under repair / cleaning)' },
            { value: 'blocked', label: 'Blocked (Reserved for administrative use)' },
            ...(room.status === 'occupied'
              ? [{ value: 'occupied', label: 'Occupied (Current active stay)' }]
              : []),
          ]}
          disabled={room.status === 'occupied'}
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Capacity"
            type="number"
            min="1"
            max="10"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
          />
          <div className="pt-6">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={isAc}
                onChange={(e) => setIsAc(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              Air Conditioned (AC)
            </label>
          </div>
        </div>

        <Input
          label="Amenities"
          value={amenities}
          onChange={(e) => setAmenities(e.target.value)}
        />

        <Textarea
          label="Remarks / Notes"
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          rows={2}
        />
      </form>
    </Modal>
  );
}
