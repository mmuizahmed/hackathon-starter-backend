import { Department } from '../src/models/Department.js';
import { Designation } from '../src/models/Designation.js';
import { Employee } from '../src/models/Employee.js';
import { LeaveType } from '../src/models/LeaveType.js';
import { Settings } from '../src/models/Settings.js';
import { User } from '../src/models/User.js';
import { DEFAULT_LEAVE_TYPES } from '../src/constants/defaultLeaveTypes.js';
import { hashPassword } from '../src/utils/password.js';
import { request } from './http.js';

// Tests insert company rows directly. Employee and settings routes belong to
// the other backend, and the app itself still starts from an empty database.

export async function createCompany() {
  const settings = await Settings.create({
    key: 'company',
    companyName: 'Saylani',
    officeStart: '09:00',
    graceMinutes: 15,
    halfDayHours: 5,
    weekend: ['Sat', 'Sun'],
    radiusMeters: 150,
    latePenalty: { enabled: false, latesPerHalfDay: 3 },
  });
  const department = await Department.create({ name: 'Engineering', active: true });
  const designation = await Designation.create({ name: 'Engineer', active: true });
  await LeaveType.insertMany(DEFAULT_LEAVE_TYPES);
  const admin = await User.create({
    name: 'Ada Admin',
    email: 'ada@example.com',
    passwordHash: await hashPassword('correct-horse'),
    role: 'admin',
    active: true,
    mustChangePassword: false,
  });
  const hr = await User.create({
    name: 'Hassan HR',
    email: 'hr@example.com',
    passwordHash: await hashPassword('hr-pass-123'),
    role: 'hr',
    active: true,
    mustChangePassword: false,
  });
  return { settings, department, designation, admin, hr };
}

let employeeSerial = 1;

export async function createEmployee({
  department,
  designation,
  name,
  email,
  code,
  joinDate = '2026-01-01',
  exitDate = null,
  basic = 100000,
  password = 'eva-pass-123',
}) {
  employeeSerial += 1;
  const employee = await Employee.create({
    code: code || `E-${String(employeeSerial).padStart(3, '0')}`,
    name,
    email,
    phone: '',
    address: '',
    department: department._id || department,
    designation: designation._id || designation,
    joinDate,
    exitDate,
    status: exitDate ? 'exited' : 'active',
    gender: 'undisclosed',
    salary: { basic },
  });
  const user = await User.create({
    name,
    email,
    passwordHash: await hashPassword(password),
    role: 'employee',
    active: true,
    mustChangePassword: false,
    employee: employee._id,
  });
  employee.user = user._id;
  await employee.save();
  return { employee, user, password };
}

export async function login(base, email, password) {
  const result = await request(base, '/api/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  if (result.status !== 200) {
    throw new Error(`Login failed for ${email}: ${result.status} ${JSON.stringify(result.json)}`);
  }
  return result.tokenCookie;
}
