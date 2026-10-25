import { env } from '../config/env.js';
import { Employee } from '../models/Employee.js';
import { AppError } from '../utils/AppError.js';
import { similarity } from '../utils/faceMatch.js';
import { assertObjectId } from '../utils/objectId.js';
import { recordAudit } from './audit.service.js';

function requireLinkedEmployee(actor) {
  if (!actor.employeeId) {
    throw new AppError('No employee profile is linked to this login', 403);
  }
  return actor.employeeId;
}

function faceStatus(row) {
  const enrolled = Boolean(row?.faceEnrolledAt);
  return {
    enrolled,
    enrolledAt: enrolled ? row.faceEnrolledAt : null,
    model: enrolled ? row.faceModel || null : null,
  };
}

function roundScore(score) {
  return Math.round(score * 100) / 100;
}

export async function getMyFace(actor) {
  const employeeId = requireLinkedEmployee(actor);
  const row = await Employee.findById(employeeId).select('faceModel faceEnrolledAt');
  if (!row) throw new AppError('Employee was not found', 404);
  return faceStatus(row);
}

export async function enrollFace(actor, input) {
  const employeeId = requireLinkedEmployee(actor);
  const now = new Date();
  // Only the first enrollment wins. A second call cannot overwrite the descriptor.
  const updated = await Employee.findOneAndUpdate(
    {
      _id: employeeId,
      $or: [{ faceEnrolledAt: null }, { faceEnrolledAt: { $exists: false } }],
    },
    {
      $set: {
        faceDescriptor: input.descriptor,
        faceModel: input.model,
        faceEnrolledAt: now,
      },
    },
    { new: true, projection: { faceDescriptor: 0 } },
  );

  if (!updated) {
    const existing = await Employee.findById(employeeId).select('_id');
    if (!existing) throw new AppError('Employee was not found', 404);
    throw new AppError('Face already enrolled. Ask HR to reset it.', 409);
  }

  await recordAudit({
    actorId: actor.id,
    action: 'face.enroll',
    entity: 'Employee',
    entityId: updated._id,
    before: { enrolled: false },
    // The descriptor stays in the employee document only. The audit row does not get a copy.
    after: { enrolled: true, model: input.model, enrolledAt: now.toISOString() },
  });
  return { enrolled: true, enrolledAt: now, model: input.model };
}

export async function resetFace(actor, employeeId) {
  assertObjectId(employeeId, 'employee id');
  const existing = await Employee.findById(employeeId).select('faceModel faceEnrolledAt');
  if (!existing) throw new AppError('Employee was not found', 404);
  const wasEnrolled = Boolean(existing.faceEnrolledAt);
  await Employee.updateOne(
    { _id: existing._id },
    { $set: { faceModel: null, faceEnrolledAt: null }, $unset: { faceDescriptor: 1 } },
  );
  await recordAudit({
    actorId: actor.id,
    action: 'face.reset',
    entity: 'Employee',
    entityId: existing._id,
    before: { enrolled: wasEnrolled, model: wasEnrolled ? existing.faceModel || null : null },
    after: { enrolled: false },
  });
  return { employeeId: existing._id.toString(), enrolled: false };
}

// Camera check-in and check-out call this after the GPS checks.
// It returns the score to store. It never returns the descriptor.
export async function assertLiveFace(employeeId, input) {
  const employee = await Employee.findById(employeeId).select('+faceDescriptor');
  const enrolled = employee?.faceDescriptor;
  if (!employee?.faceEnrolledAt || !Array.isArray(enrolled) || enrolled.length === 0) {
    throw new AppError('Enroll your face first', 422);
  }
  if (input?.liveness?.blink !== true) {
    throw new AppError('Blink check failed', 422);
  }
  if (!Array.isArray(input.descriptor)) {
    throw new AppError('Face descriptor is required', 422);
  }
  if (input.descriptor.length !== enrolled.length) {
    throw new AppError('Face descriptor length does not match the enrolled face', 422);
  }
  const score = similarity(input.descriptor, enrolled);
  if (!Number.isFinite(score) || score < env.faceMatchThreshold) {
    throw new AppError('Face does not match the enrolled face', 422);
  }
  return { faceMatchScore: roundScore(score), liveness: true };
}
