import assert from 'node:assert/strict';
import test from 'node:test';
import { assertOwnEmployee, employeeScopeFilter } from '../src/services/scope.service.js';

test('employees can only match their own employee id', () => {
  const employee = { role: 'employee', employeeId: 'emp-1' };
  assert.deepEqual(employeeScopeFilter(employee), { employee: 'emp-1' });
  assert.doesNotThrow(() => assertOwnEmployee(employee, 'emp-1'));

  let caught = null;
  try {
    assertOwnEmployee(employee, 'emp-2');
  } catch (error) {
    caught = error;
  }
  assert.ok(caught);
  assert.equal(caught.statusCode, 403);
  assert.equal(caught.message, 'You can only access your own records');
});

test('admin and HR are not scoped to one employee', () => {
  const hr = { role: 'hr', employeeId: null };
  assert.deepEqual(employeeScopeFilter(hr), {});
  assert.doesNotThrow(() => assertOwnEmployee(hr, 'emp-2'));
});

test('an employee login with no profile matches nothing', () => {
  const employee = { role: 'employee', employeeId: null };
  assert.deepEqual(employeeScopeFilter(employee), { employee: { $in: [] } });
  assert.throws(() => assertOwnEmployee(employee, 'emp-1'));
});
