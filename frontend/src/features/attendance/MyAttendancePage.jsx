import PageHeader from '../../components/ui/PageHeader';
import AttendanceCalendar from '../../components/AttendanceCalendar';
import { useAuth } from '../../context/AuthContext';

export default function MyAttendancePage() {
  const { user } = useAuth();
  return (
    <div className="space-y-5">
      <PageHeader title="My Attendance" subtitle="Present and late days count towards your percentage; leave and out-pass days are excluded." />
      <AttendanceCalendar url={`/attendance/student/${user.studentId}`} />
    </div>
  );
}
