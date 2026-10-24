// API user shape. Do not send the mongoose document: it can contain passwordHash.
export function toPublicUser(user) {
  let employeeId = null;
  if (user.employee) {
    employeeId = user.employee._id ? user.employee._id.toString() : user.employee.toString();
  }

  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    mustChangePassword: Boolean(user.mustChangePassword),
    employeeId,
  };
}

// req.user is the public shape plus `active`, which middleware needs and the client does not.
export function toRequestUser(user) {
  return {
    ...toPublicUser(user),
    active: user.active !== false,
  };
}

export function publicUserFromRequest(reqUser) {
  return {
    id: reqUser.id,
    name: reqUser.name,
    email: reqUser.email,
    role: reqUser.role,
    mustChangePassword: reqUser.mustChangePassword,
    employeeId: reqUser.employeeId,
  };
}
